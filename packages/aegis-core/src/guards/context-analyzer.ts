/**
 * Context Analyzer for multi-turn conversation analysis.
 *
 * Detects:
 * - Gradual escalation attacks (benign → probing → injection)
 * - Split injection attacks (injection spread across multiple turns)
 * - Context confusion (rapid topic changes)
 * - Intent trajectory tracking
 */

import type {
  IntentType,
  ContextResult,
  ContextDriftMetrics,
} from '@aegis/common';
import { SemanticAnalyzer } from '../ml/semantic-analyzer.js';

// ============================================
// Types
// ============================================

export interface TurnInfo {
  readonly message: string;
  readonly intent: IntentType;
  readonly riskScore: number;
  readonly timestamp: number;
}

export interface SessionState {
  readonly sessionId: string;
  readonly turns: TurnInfo[];
  readonly createdAt: number;
  readonly lastUpdatedAt: number;
}

export interface ContextAnalyzerOptions {
  readonly maxHistoryTurns?: number;
  readonly sessionTTL?: number; // milliseconds
  readonly escalationThreshold?: number;
  readonly driftThreshold?: number;
  readonly pruneIntervalMs?: number;
}

const DEFAULT_OPTIONS: Required<ContextAnalyzerOptions> = {
  maxHistoryTurns: 10,
  sessionTTL: 30 * 60 * 1000, // 30 minutes
  escalationThreshold: 0.6,
  driftThreshold: 0.3,
  pruneIntervalMs: 5 * 60 * 1000, // 5 minutes
};

// ============================================
// Multi-turn Attack Patterns
// ============================================

/**
 * Intent risk scores for escalation detection.
 */
const INTENT_RISK_SCORES: Record<IntentType, number> = {
  benign: 0.0,
  context_confusion: 0.3,
  role_manipulation: 0.5,
  gradual_escalation: 0.6,
  override_instructions: 0.8,
  exfiltrate_data: 0.9,
  jailbreak_attempt: 1.0,
};

/**
 * Patterns for split injection detection.
 * These are partial phrases that when combined form an injection.
 */
const SPLIT_INJECTION_FRAGMENTS = [
  // English fragments
  ['ignore', 'previous', 'instructions'],
  ['show', 'system', 'prompt'],
  ['you', 'are', 'now', 'unrestricted'],
  ['forget', 'everything', 'told'],
  ['bypass', 'safety', 'filter'],
  // Korean fragments
  ['이전', '지시', '무시'],
  ['시스템', '프롬프트', '보여'],
  ['제한', '해제'],
];

// ============================================
// Context Analyzer
// ============================================

export class ContextAnalyzer {
  private readonly sessions: Map<string, SessionState> = new Map();
  private readonly semanticAnalyzer: SemanticAnalyzer;
  private readonly options: Required<ContextAnalyzerOptions>;
  private pruneTimer: NodeJS.Timeout | null = null;

  constructor(
    semanticAnalyzer: SemanticAnalyzer,
    options: ContextAnalyzerOptions = {},
  ) {
    this.semanticAnalyzer = semanticAnalyzer;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    // Start periodic session pruning
    this.startPruning();
  }

  /**
   * Analyzes the current message in the context of the conversation.
   */
  async analyze(
    sessionId: string,
    message: string,
    conversationHistory?: string[],
  ): Promise<ContextResult> {
    const now = Date.now();

    // Get or create session
    let session = this.sessions.get(sessionId);
    if (!session || this.isSessionExpired(session, now)) {
      session = {
        sessionId,
        turns: [],
        createdAt: now,
        lastUpdatedAt: now,
      };
    }

    // Analyze current message intent
    const semanticResult = await this.semanticAnalyzer.analyze(message);
    const currentIntent = semanticResult.intent;
    const currentRisk = semanticResult.confidence;

    // Add current turn
    const newTurn: TurnInfo = {
      message,
      intent: currentIntent,
      riskScore: currentRisk,
      timestamp: now,
    };

    // Update session with conversation history if provided
    let turns = [...session.turns];
    if (conversationHistory && conversationHistory.length > 0 && turns.length === 0) {
      // Initialize from conversation history
      for (const histMsg of conversationHistory) {
        const histResult = await this.semanticAnalyzer.analyze(histMsg);
        turns.push({
          message: histMsg,
          intent: histResult.intent,
          riskScore: histResult.confidence,
          timestamp: now - (conversationHistory.length - turns.length) * 1000,
        });
      }
    }

    turns.push(newTurn);

    // Trim to max turns
    if (turns.length > this.options.maxHistoryTurns) {
      turns = turns.slice(-this.options.maxHistoryTurns);
    }

    // Update session
    const updatedSession: SessionState = {
      sessionId,
      turns,
      createdAt: session.createdAt,
      lastUpdatedAt: now,
    };
    this.sessions.set(sessionId, updatedSession);

    // Analyze patterns
    const detectedPatterns: string[] = [];
    let cumulativeRiskScore = 0;

    // 1. Detect escalation
    const escalationScore = this.detectEscalation(turns);
    if (escalationScore >= this.options.escalationThreshold) {
      detectedPatterns.push('gradual_escalation');
      cumulativeRiskScore = Math.max(cumulativeRiskScore, escalationScore);
    }

    // 2. Detect split injection
    const splitScore = this.detectSplitInjection(turns);
    if (splitScore > 0) {
      detectedPatterns.push('split_injection');
      cumulativeRiskScore = Math.max(cumulativeRiskScore, splitScore);
    }

    // 3. Compute drift metrics
    const drift = this.computeIntentDrift(turns);
    if (drift.intentShift >= this.options.driftThreshold) {
      detectedPatterns.push('context_confusion');
    }

    // 4. Consider cumulative risk from individual turns
    const avgRisk = turns.reduce((sum, t) => sum + t.riskScore, 0) / turns.length;
    const maxRisk = Math.max(...turns.map(t => t.riskScore));
    cumulativeRiskScore = Math.max(cumulativeRiskScore, (avgRisk + maxRisk) / 2);

    // Extract intent trajectory
    const trajectory = turns.map(t => t.intent);

    return {
      turnCount: turns.length,
      detectedPatterns,
      cumulativeRiskScore: Math.min(1.0, cumulativeRiskScore),
      drift,
      trajectory,
    };
  }

  /**
   * Detects gradual escalation pattern.
   * Returns escalation score (0-1).
   */
  private detectEscalation(turns: TurnInfo[]): number {
    if (turns.length < 3) return 0;

    // Calculate risk trend
    const riskScores = turns.map(t => INTENT_RISK_SCORES[t.intent]);

    // Check if there's an increasing trend
    let increasingCount = 0;
    let totalChanges = 0;

    for (let i = 1; i < riskScores.length; i++) {
      const diff = riskScores[i] - riskScores[i - 1];
      if (diff > 0) increasingCount++;
      if (diff !== 0) totalChanges++;
    }

    // Calculate escalation score
    if (totalChanges === 0) return 0;

    const trendScore = increasingCount / totalChanges;
    const finalRisk = riskScores[riskScores.length - 1];
    const riskIncrease = finalRisk - riskScores[0];

    // Combine trend and risk increase
    const escalationScore = (trendScore * 0.4) + (riskIncrease * 0.6);

    return Math.max(0, Math.min(1, escalationScore));
  }

  /**
   * Detects split injection attacks.
   * Returns detection score (0-1).
   */
  private detectSplitInjection(turns: TurnInfo[]): number {
    if (turns.length < 2) return 0;

    // Combine recent messages
    const recentMessages = turns.slice(-5).map(t => t.message.toLowerCase());
    const combined = recentMessages.join(' ');

    // Check for split injection patterns
    let matchCount = 0;

    for (const fragments of SPLIT_INJECTION_FRAGMENTS) {
      let allFound = true;
      let acrossTurns = false;

      for (const fragment of fragments) {
        if (!combined.includes(fragment.toLowerCase())) {
          allFound = false;
          break;
        }
      }

      if (allFound) {
        // Check if fragments are split across turns
        for (const fragment of fragments) {
          const foundInTurns = recentMessages.filter(m => m.includes(fragment.toLowerCase()));
          if (foundInTurns.length > 0 && foundInTurns.length < recentMessages.length) {
            acrossTurns = true;
            break;
          }
        }

        if (acrossTurns) {
          matchCount++;
        }
      }
    }

    return matchCount > 0 ? Math.min(1.0, 0.7 + matchCount * 0.1) : 0;
  }

  /**
   * Computes intent drift metrics.
   */
  private computeIntentDrift(turns: TurnInfo[]): ContextDriftMetrics {
    if (turns.length < 2) {
      return {
        intentShift: 0,
        topicCoherence: 1.0,
        escalationScore: 0,
      };
    }

    // Intent shift: count of intent changes / total turns
    let intentChanges = 0;
    for (let i = 1; i < turns.length; i++) {
      if (turns[i].intent !== turns[i - 1].intent) {
        intentChanges++;
      }
    }
    const intentShift = intentChanges / (turns.length - 1);

    // Topic coherence: inverse of message length variance (simplified)
    const lengths = turns.map(t => t.message.length);
    const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum, len) => sum + Math.pow(len - avgLen, 2), 0) / lengths.length;
    const topicCoherence = Math.max(0, 1 - Math.min(1, variance / 10000));

    // Escalation score
    const escalationScore = this.detectEscalation(turns);

    return {
      intentShift,
      topicCoherence,
      escalationScore,
    };
  }

  /**
   * Checks if a session has expired.
   */
  private isSessionExpired(session: SessionState, now: number): boolean {
    return now - session.lastUpdatedAt > this.options.sessionTTL;
  }

  /**
   * Starts periodic session pruning.
   */
  private startPruning(): void {
    if (this.pruneTimer) return;

    this.pruneTimer = setInterval(() => {
      this.pruneExpiredSessions();
    }, this.options.pruneIntervalMs);

    // Don't prevent process exit
    if (this.pruneTimer.unref) {
      this.pruneTimer.unref();
    }
  }

  /**
   * Removes expired sessions.
   */
  pruneExpiredSessions(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [sessionId, session] of this.sessions) {
      if (this.isSessionExpired(session, now)) {
        this.sessions.delete(sessionId);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Gets a session by ID.
   */
  getSession(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Clears a specific session.
   */
  clearSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Clears all sessions.
   */
  clearAllSessions(): void {
    this.sessions.clear();
  }

  /**
   * Stops the analyzer and cleans up resources.
   */
  destroy(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
    this.sessions.clear();
  }

  /**
   * Returns the number of active sessions.
   */
  get sessionCount(): number {
    return this.sessions.size;
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Creates a context analyzer with default settings.
 */
export const createContextAnalyzer = (
  semanticAnalyzer: SemanticAnalyzer,
  options?: ContextAnalyzerOptions,
): ContextAnalyzer => {
  return new ContextAnalyzer(semanticAnalyzer, options);
};
