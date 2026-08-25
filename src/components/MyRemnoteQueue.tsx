import {
  usePlugin,
  Card,
  Rem,
  QueueInteractionScore,
  RNPlugin,
  RepetitionStatus,
  BuiltInPowerupCodes,
  CardType,
  RemType,
} from "@remnote/plugin-sdk";
import { useState, useEffect, useCallback, useRef } from "react";
import { SearchData, getCleanTags, getRemText, getCleanChildren } from "../widgets/customQueueWidget";
import { MyRemNoteButtonSmall, MyRemNoteButtonSmallById } from "./MyRemnoteButton";
import { MyRemnoteRemViewer, extractHintFromBackText, detectRichTextLatexCloze } from "./MyRemnoteRemViewer";

interface MyRemNoteQueueProps {
  /** Array of card data objects containing rem and card */
  cards: SearchData[];
  width?: string | number;
  maxWidth?: string | number;
  onQueueComplete?: () => void;
  /** Callback when queue changes (card skipped or rated) */
  onCardInteraction?: (newOrder: SearchData[]) => void;
  /** Initial index to start from (for restoring position after tab switch) */
  initialIndex?: number;
  /** Callback when current index changes */
  onCurrentIndexChange?: (newIndex: number) => void;
}

type AnswerState = "question" | "answer";

// Styles
const containerBaseStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  padding: "16px",
  boxSizing: "border-box",
  position: "relative",
  minHeight: 0,
};

const cardContainerStyle: React.CSSProperties = {
  border: "1px solid var(--border-color, #ddd)",
  borderRadius: "8px",
  padding: "16px",
  minHeight: "200px",
  position: "relative",
  overflow: "visible",
};

const questionStyle: React.CSSProperties = {
  fontSize: "1.2em",
  marginBottom: "16px",
  position: "relative",
};

const answerStyle: React.CSSProperties = {
  marginTop: "16px",
  paddingTop: "16px",
  borderTop: "1px solid var(--border-color, #eee)",
  position: "relative",
};

const childRemStyle: React.CSSProperties = {
  marginLeft: "16px",
  marginTop: "8px",
  position: "relative",
};

const buttonContainerStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  flexWrap: "wrap",
  justifyContent: "center",
  marginTop: "16px",
};

const buttonBaseStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: "6px",
  border: "none",
  cursor: "pointer",
  fontSize: "14px",
  fontWeight: 500,
  transition: "background-color 0.2s",
};

const showAnswerButtonStyle: React.CSSProperties = {
  ...buttonBaseStyle,
  backgroundColor: "#4a90d9",
  color: "white",
  width: "100%",
  padding: "14px 20px",
  fontSize: "16px",
};

const skipButtonStyle: React.CSSProperties = {
  ...buttonBaseStyle,
  backgroundColor: "#888",
  color: "white",
};

const forgetButtonStyle: React.CSSProperties = {
  ...buttonBaseStyle,
  backgroundColor: "#e74c3c",
  color: "white",
};

const partialButtonStyle: React.CSSProperties = {
  ...buttonBaseStyle,
  backgroundColor: "#f39c12",
  color: "white",
};

const recalledButtonStyle: React.CSSProperties = {
  ...buttonBaseStyle,
  backgroundColor: "#27ae60",
  color: "white",
};

const easyButtonStyle: React.CSSProperties = {
  ...buttonBaseStyle,
  backgroundColor: "#2ecc71",
  color: "white",
};

const progressStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: "14px",
};

const answerLabelStyle: React.CSSProperties = {
  fontWeight: "bold",
  marginBottom: "8px",
  opacity: 0.7,
};

const noContentStyle: React.CSSProperties = {
  fontStyle: "italic",
  opacity: 0.5,
};

const messageStyle: React.CSSProperties = {
  textAlign: "center",
};

const successMessageStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: "1.2em",
};

const earlyReviewStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: "14px",
  color: "#f39c12",
  fontWeight: 500,
  marginTop: "12px",
  padding: "8px",
  backgroundColor: "rgba(243, 156, 18, 0.1)",
  borderRadius: "6px",
};

const lastIntervalStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: "14px",
  color: "var(--text-muted, #888)",
  fontWeight: 500,
  marginTop: "12px",
  padding: "8px",
  backgroundColor: "var(--background-secondary, rgba(0,0,0,0.05))",
  borderRadius: "6px",
};

const progressButtonStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: "14px",
  cursor: "pointer",
};

const breadcrumbContainerStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "4px",
  fontSize: "13px",
  opacity: 0.8,
  padding: "8px 12px",
  backgroundColor: "var(--background-secondary, rgba(0,0,0,0.05))",
  borderRadius: "6px",
  marginBottom: "8px",
};

const breadcrumbSeparatorStyle: React.CSSProperties = {
  color: "var(--text-muted, #888)",
  margin: "0 2px",
};

const breadcrumbItemStyle: React.CSSProperties = {
  cursor: "pointer",
  color: "var(--text-link, #4a90d9)",
  textDecoration: "none",
};

const breadcrumbCurrentStyle: React.CSSProperties = {
  fontWeight: 500,
  color: "var(--text-normal, inherit)",
};

const tagListStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  marginBottom: "12px",
};

const tagChipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 10px",
  borderRadius: "999px",
  fontSize: "12px",
  lineHeight: 1.4,
  backgroundColor: "var(--background-secondary, rgba(0,0,0,0.05))",
  border: "1px solid var(--border-color, #ddd)",
  color: "var(--text-normal, inherit)",
};

// Helper function to get the hierarchical path of a Rem
async function getRemPath(plugin: RNPlugin, rem: Rem): Promise<{ id: string; text: string; isDocument: boolean }[]> {
  const _t0 = performance.now();
  const path: { id: string; text: string; isDocument: boolean }[] = [];
  let currentRem: Rem | undefined = rem;
  let _depth = 0;
  
  // Traverse up the hierarchy
  while (currentRem) {
    const _td0 = performance.now();
    const text = await getRemText(plugin, currentRem);
    console.log(`[TIMING] getRemPath d=${_depth} getRemText: ${(performance.now()-_td0).toFixed(1)}ms`);
    const _td1 = performance.now();
    const isDocument = await currentRem.isDocument();
    console.log(`[TIMING] getRemPath d=${_depth} isDocument: ${(performance.now()-_td1).toFixed(1)}ms`);
    path.unshift({ id: currentRem._id, text: text || "(untitled)", isDocument });
    const _td2 = performance.now();
    currentRem = await currentRem.getParentRem();
    console.log(`[TIMING] getRemPath d=${_depth} getParentRem: ${(performance.now()-_td2).toFixed(1)}ms`);
    _depth++;
  }
  
  console.log(`[TIMING] getRemPath TOTAL (${_depth} levels): ${(performance.now()-_t0).toFixed(1)}ms`);
  return path;
}

// Helper function to format milliseconds to human-readable string
function formatMilliseconds(ms: number, abs = false): string {
  let isNegative = false;

  if (ms === 0) return 'New Card';
  if (ms < 0) {
    isNegative = true;
    ms = Math.abs(ms);
  }

  const millisecondsInSecond = 1000;
  const millisecondsInMinute = millisecondsInSecond * 60;
  const millisecondsInHour = millisecondsInMinute * 60;
  const millisecondsInDay = millisecondsInHour * 24;

  let value, unit;

  if (ms >= millisecondsInDay) {
    value = ms / millisecondsInDay;
    unit = 'day';
  } else if (ms >= millisecondsInHour) {
    value = ms / millisecondsInHour;
    unit = 'hour';
  } else if (ms >= millisecondsInMinute) {
    value = ms / millisecondsInMinute;
    unit = 'minute';
  } else if (ms >= millisecondsInSecond) {
    value = ms / millisecondsInSecond;
    unit = 'second';
  } else {
    value = ms;
    unit = 'millisecond';
  }

  value = Math.round(value * 100) / 100;
  const plural = value !== 1 ? 's' : '';
  return (isNegative && !abs ? "-" : "") + value + " " + unit + plural;
}

// Helper function to get last interval from repetition history
function getLastInterval(history: RepetitionStatus[] | undefined): { workingInterval: number, intervalSetOn: number } | undefined {
  if (!history || history.length === 0) {
    return undefined;
  }

  for (let i = history.length - 1; i >= 0; i--) {
    const repetition = history[i];
    if (repetition.pluginData && typeof repetition.pluginData.workingInterval === 'number' && typeof repetition.pluginData.intervalSetOn === 'number') {
      return { workingInterval: repetition.pluginData.workingInterval, intervalSetOn: repetition.pluginData.intervalSetOn };
    }
  }

  return undefined;
}

// Constants for interval calculations (in milliseconds)
const DEFAULT_AGAIN_MIN = 30 * 60 * 1000; // 30 minutes
const DEFAULT_HARD_HOUR = 12 * 60 * 60 * 1000; // 12 hours
const DEFAULT_GOOD_DAY = 2 * 24 * 60 * 60 * 1000; // 2 days
const DEFAULT_EASY_DAY = 4 * 24 * 60 * 60 * 1000; // 4 days

// Helper function to count consecutive AGAIN scores at the end of history (excluding the hypothetical current answer)
function getWrongInRow(history: RepetitionStatus[]): number {
  let count = 0;
  // Count from the second-to-last item backwards (since last item is the hypothetical current answer)
  for (let i = history.length - 2; i >= 0; i--) {
    if (history[i].score === QueueInteractionScore.AGAIN) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

// Calculate the next interval for a given score without actually updating the card
function calculateNextInterval(
  history: RepetitionStatus[] | undefined,
  hypotheticalScore: QueueInteractionScore
): number {
  // Create a mock history with the hypothetical answer appended
  const mockHistory: RepetitionStatus[] = history ? [...history] : [];
  const currentRep = { score: hypotheticalScore } as RepetitionStatus;
  mockHistory.push(currentRep);

  const lastInterval = getLastInterval(history);
  const lastWorkingInterval = lastInterval ? lastInterval.workingInterval : 0;

  switch (hypotheticalScore) {
    case QueueInteractionScore.AGAIN:
      return DEFAULT_AGAIN_MIN;

    case QueueInteractionScore.HARD:
    case QueueInteractionScore.GOOD:
    case QueueInteractionScore.EASY:
      // This is a new Card (no previous working interval)
      if (lastWorkingInterval === 0) {
        if (hypotheticalScore === QueueInteractionScore.HARD) {
          return DEFAULT_HARD_HOUR;
        } else if (hypotheticalScore === QueueInteractionScore.GOOD) {
          return DEFAULT_GOOD_DAY;
        } else { // EASY
          return DEFAULT_EASY_DAY;
        }
      }

      // Not a new Card - check for previous failures
      const wrongInRow = getWrongInRow(mockHistory);

      // Regular Progression (no recent failures)
      if (wrongInRow === 0) {
        const multipliers: { [key in QueueInteractionScore]?: number } = {
          [QueueInteractionScore.HARD]: 0.75,
          [QueueInteractionScore.GOOD]: 1.5,
          [QueueInteractionScore.EASY]: 3,
        };
        return Math.max(DEFAULT_HARD_HOUR, lastWorkingInterval * (multipliers[hypotheticalScore] || 1));
      }

      // Previously Failed Card - reduce interval based on consecutive AGAIN scores
      const denominators: { [key in QueueInteractionScore]?: number } = {
        [QueueInteractionScore.HARD]: wrongInRow + 3,
        [QueueInteractionScore.GOOD]: wrongInRow + 2,
        [QueueInteractionScore.EASY]: wrongInRow + 1,
      };
      return Math.max(DEFAULT_HARD_HOUR, lastWorkingInterval / (denominators[hypotheticalScore] || 1));

    default:
      return DEFAULT_HARD_HOUR;
  }
}

// Helper function to get last rating strings from repetition history
function getLastRatingStr(history: RepetitionStatus[] | undefined, count: number): string[] {
  const result: string[] = [];
  if (history && history.length > 0) {
    for (let i = history.length - 1; i >= 0 && result.length < count; i--) {
      const score = history[i].score;
      let ratingStr = "";
      switch (score) {
        case QueueInteractionScore.AGAIN:
          ratingStr = "Forgot";
          break;
        case QueueInteractionScore.HARD:
          ratingStr = "Partially recalled";
          break;
        case QueueInteractionScore.GOOD:
          ratingStr = "Recalled with effort";
          break;
        case QueueInteractionScore.EASY:
          ratingStr = "Easily recalled";
          break;
        default:
          continue;
      }
      result.push(ratingStr);
    }
  }
  return result;
}

// Score to image map for displaying rating icons
const scoreToImage = new Map<string, string>([
  ["Skip", "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAzNiI+PHBhdGggZmlsbD0iI0ZGQ0M0RCIgZD0iTTIwIDYuMDQyYzAgMS4xMTItLjkwMyAyLjAxNC0yIDIuMDE0cy0yLS45MDItMi0yLjAxNFYyLjAxNEMxNiAuOTAxIDE2LjkwMyAwIDE4IDBzMiAuOTAxIDIgMi4wMTR2NC4wMjh6Ii8+PHBhdGggZmlsbD0iI0ZGQUMzMyIgZD0iTTkuMTggMzZjLS4yMjQgMC0uNDUyLS4wNTItLjY2Ni0uMTU5YTEuNTIxIDEuNTIxIDAgMCAxLS42NjctMi4wMjdsOC45NC0xOC4xMjdjLjI1Mi0uNTEyLjc2OC0uODM1IDEuMzMzLS44MzVzMS4wODEuMzIzIDEuMzMzLjgzNWw4Ljk0MSAxOC4xMjdhMS41MiAxLjUyIDAgMCAxLS42NjYgMi4wMjcgMS40ODIgMS40ODIgMCAwIDEtMS45OTktLjY3NkwxOC4xMjEgMTkuNzRsLTcuNjA3IDE1LjQyNUExLjQ5IDEuNDkgMCAwIDEgOS4xOCAzNnoiLz48cGF0aCBmaWxsPSIjNTg1OTVCIiBkPSJNMTguMTIxIDIwLjM5MmEuOTg1Ljk4NSAwIDAgMS0uNzAyLS4yOTVMMy41MTIgNS45OThjLS4zODgtLjM5NC0uMzg4LTEuMDMxIDAtMS40MjRzMS4wMTctLjM5MyAxLjQwNCAwTDE4LjEyMSAxNy45NiAzMS4zMjQgNC41NzNhLjk4NS45ODUgMCAwIDEgMS40MDUgMCAxLjAxNyAxLjAxNyAwIDAgMSAwIDEuNDI0bC0xMy45MDUgMTQuMWEuOTkyLjk5MiAwIDAgMS0uNzAzLjI5NXoiLz48cGF0aCBmaWxsPSIjREQyRTQ0IiBkPSJNMzQuMDE1IDE5LjM4NWMwIDguODk4LTcuMTE1IDE2LjExMS0xNS44OTQgMTYuMTExLTguNzc3IDAtMTUuODkzLTcuMjEzLTE1Ljg5My0xNi4xMTEgMC04LjkgNy4xMTYtMTYuMTEzIDE1Ljg5My0xNi4xMTMgOC43NzgtLjAwMSAxNS44OTQgNy4yMTMgMTUuODk0IDE2LjExM3oiLz48cGF0aCBmaWxsPSIjRTZFN0U4IiBkPSJNMzAuMDQxIDE5LjM4NWMwIDYuNjc0LTUuMzM1IDEyLjA4NC0xMS45MiAxMi4wODQtNi41ODMgMC0xMS45MTktNS40MS0xMS45MTktMTIuMDg0QzYuMjAyIDEyLjcxIDExLjUzOCA3LjMgMTguMTIxIDcuM2M2LjU4NS0uMDAxIDExLjkyIDUuNDEgMTEuOTIgMTIuMDg1eiIvPjxwYXRoIGZpbGw9IiNGRkNDNEQiIGQ9Ik0zMC4wNCAxLjI1N2E1Ljg5OSA1Ljg5OSAwIDAgMC00LjIxNCAxLjc3bDguNDI5IDguNTQ0QTYuMDY0IDYuMDY0IDAgMCAwIDM2IDcuMjk5YzAtMy4zMzYtMi42NjktNi4wNDItNS45Ni02LjA0MnptLTI0LjA4IDBhNS45IDUuOSAwIDAgMSA0LjIxNCAxLjc3bC04LjQyOSA4LjU0NEE2LjA2NCA2LjA2NCAwIDAgMSAwIDcuMjk5YzAtMy4zMzYgMi42NjgtNi4wNDIgNS45Ni02LjA0MnoiLz48cGF0aCBmaWxsPSIjNDE0MDQyIiBkPSJNMjMgMjBoLTVhMSAxIDAgMCAxLTEtMXYtOWExIDEgMCAwIDEgMiAwdjhoNGExIDEgMCAxIDEgMCAyeiIvPjwvc3ZnPg=="],
  ["Forgot", "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAzNiI+PHBhdGggZmlsbD0iI0REMkU0NCIgZD0iTTIxLjUzMyAxOC4wMDIgMzMuNzY4IDUuNzY4YTIuNSAyLjUgMCAwIDAtMy41MzUtMy41MzVMMTcuOTk4IDE0LjQ2NyA1Ljc2NCAyLjIzM2EyLjQ5OCAyLjQ5OCAwIDAgMC0zLjUzNSAwIDIuNDk4IDIuNDk4IDAgMCAwIDAgMy41MzVsMTIuMjM0IDEyLjIzNEwyLjIwMSAzMC4yNjVhMi40OTggMi40OTggMCAwIDAgMS43NjggNC4yNjdjLjY0IDAgMS4yOC0uMjQ0IDEuNzY4LS43MzJsMTIuMjYyLTEyLjI2MyAxMi4yMzQgMTIuMjM0YTIuNDkzIDIuNDkzIDAgMCAwIDEuNzY4LjczMiAyLjUgMi41IDAgMCAwIDEuNzY4LTQuMjY3TDIxLjUzMyAxOC4wMDJ6Ii8+PC9zdmc+"],
  ["Partially recalled", "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAzNiI+PHBhdGggZmlsbD0iI0ZGQ0M0RCIgZD0iTTM2IDE4YzAgOS45NDEtOC4wNTkgMTgtMTggMTgtOS45NCAwLTE4LTguMDU5LTE4LTE4QzAgOC4wNiA4LjA2IDAgMTggMGM5Ljk0MSAwIDE4IDguMDYgMTggMTgiLz48ZWxsaXBzZSBmaWxsPSIjNjY0NTAwIiBjeD0iMTIiIGN5PSIxMy41IiByeD0iMi41IiByeT0iMy41Ii8+PGVsbGlwc2UgZmlsbD0iIzY2NDUwMCIgY3g9IjI0IiBjeT0iMTMuNSIgcng9IjIuNSIgcnk9IjMuNSIvPjxwYXRoIGZpbGw9IiNGRkYiIGQ9Ik0yNSAyMWE0IDQgMCAwIDEgMCA4SDExYTQgNCAwIDAgMSAwLThoMTR6Ii8+PHBhdGggZmlsbD0iIzY2NDUwMCIgZD0iTTI1IDIwSDExYy0yLjc1NyAwLTUgMi4yNDMtNSA1czIuMjQzIDUgNSA1aDE0YzIuNzU3IDAgNS0yLjI0MyA1LTVzLTIuMjQzLTUtNS01em0wIDJhMi45OTcgMi45OTcgMCAwIDEgMi45NDkgMi41SDI0LjVWMjJoLjV6bS0xLjUgMHYyLjVoLTNWMjJoM3ptLTQgMHYyLjVoLTNWMjJoM3ptLTQgMHYyLjVoLTNWMjJoM3pNMTEgMjJoLjV2Mi41SDguMDUxQTIuOTk3IDIuOTk3IDAgMCAxIDExIDIyem0wIDZhMi45OTcgMi45OTcgMCAwIDEtMi45NDktMi41SDExLjVWMjhIMTF6bTEuNSAwdi0yLjVoM1YyOGgtM3ptNCAwdi0yLjVoM1YyOGgtM3ptNCAwdi0yLjVoM1YyOGgtM3ptNC41IDBoLS41di0yLjVoMy40NDlBMi45OTcgMi45OTcgMCAwIDEgMjUgMjh6Ii8+PC9zdmc+"],
  ["Recalled with effort", "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAzNiI+PHBhdGggZmlsbD0iI0ZGQ0M0RCIgZD0iTTM2IDE4YzAgOS45NDEtOC4wNTkgMTgtMTggMTgtOS45NCAwLTE4LTguMDU5LTE4LTE4QzAgOC4wNiA4LjA2IDAgMTggMGM5Ljk0MSAwIDE4IDguMDYgMTggMTgiLz48cGF0aCBmaWxsPSIjNjY0NTAwIiBkPSJNMjguNDU3IDE3Ljc5N2MtLjA2LS4xMzUtMS40OTktMy4yOTctNC40NTctMy4yOTctMi45NTcgMC00LjM5NyAzLjE2Mi00LjQ1NyAzLjI5N2EuNTAzLjUwMyAwIDAgMCAuNzU1LjYwNWMuMDEyLS4wMDkgMS4yNjItLjkwMiAzLjcwMi0uOTAyIDIuNDI2IDAgMy42NzQuODgxIDMuNzAyLjkwMWEuNDk4LjQ5OCAwIDAgMCAuNzU1LS42MDR6bS0xMiAwYy0uMDYtLjEzNS0xLjQ5OS0zLjI5Ny00LjQ1Ny0zLjI5Ny0yLjk1NyAwLTQuMzk3IDMuMTYyLTQuNDU3IDMuMjk3YS40OTkuNDk5IDAgMCAwIC43NTQuNjA1QzguMzEgMTguMzkzIDkuNTU5IDE3LjUgMTIgMTcuNWMyLjQyNiAwIDMuNjc0Ljg4MSAzLjcwMi45MDFhLjQ5OC40OTggMCAwIDAgLjc1NS0uNjA0ek0xOCAyMmMtMy42MjMgMC02LjAyNy0uNDIyLTktMS0uNjc5LS4xMzEtMiAwLTIgMiAwIDQgNC41OTUgOSAxMSA5IDYuNDA0IDAgMTEtNSAxMS05IDAtMi0xLjMyMS0yLjEzMi0yLTItMi45NzMuNTc4LTUuMzc3IDEtOSAxeiIvPjxwYXRoIGZpbGw9IiNGRkYiIGQ9Ik05IDIzczMgMSA5IDEgOS0xIDktMS0yIDQtOSA0LTktNC05LTR6Ii8+PC9zdmc+"],
  ["Easily recalled", "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAzNiI+PHBhdGggZmlsbD0iI0Y0OTAwQyIgZD0iTTE0LjE3NCAxNy4wNzUgNi43NSA3LjU5NGwtMy43MjIgOS40ODF6Ii8+PHBhdGggZmlsbD0iI0Y0OTAwQyIgZD0ibTE3LjkzOCA1LjUzNC02LjU2MyAxMi4zODlIMjQuNXoiLz48cGF0aCBmaWxsPSIjRjQ5MDBDIiBkPSJtMjEuODI2IDE3LjA3NSA3LjQyNC05LjQ4MSAzLjcyMiA5LjQ4MXoiLz48cGF0aCBmaWxsPSIjRkZDQzREIiBkPSJNMjguNjY5IDE1LjE5IDIzLjg4NyAzLjUyM2wtNS44OCAxMS42NjgtLjAwNy4wMDMtLjAwNy0uMDA0LTUuODgtMTEuNjY4TDcuMzMxIDE1LjE5QzQuMTk3IDEwLjgzMyAxLjI4IDguMDQyIDEuMjggOC4wNDJTMyAyMC43NSAzIDMzaDMwYzAtMTIuMjUgMS43Mi0yNC45NTggMS43Mi0yNC45NThzLTIuOTE3IDIuNzkxLTYuMDUxIDcuMTQ4eiIvPjxjaXJjbGUgZmlsbD0iIzVDOTEzQiIgY3g9IjE3Ljk1NyIgY3k9IjIyIiByPSIzLjY4OCIvPjxjaXJjbGUgZmlsbD0iIzk4MUNFQiIgY3g9IjI2LjQ2MyIgY3k9IjIyIiByPSIyLjQxMiIvPjxjaXJjbGUgZmlsbD0iI0REMkU0NCIgY3g9IjMyLjg1MiIgY3k9IjIyIiByPSIxLjk4NiIvPjxjaXJjbGUgZmlsbD0iIzk4MUNFQiIgY3g9IjkuNDUiIGN5PSIyMiIgcj0iMi40MTIiLz48Y2lyY2xlIGZpbGw9IiNERDJFNDQiIGN4PSIzLjA2MSIgY3k9IjIyIiByPSIxLjk4NiIvPjxwYXRoIGZpbGw9IiNGRkFDMzMiIGQ9Ik0zMyAzNEgzYTEgMSAwIDEgMSAwLTJoMzBhMSAxIDAgMSAxIDAgMnptMC0zLjQ4NkgzYTEgMSAwIDEgMSAwLTJoMzBhMSAxIDAgMSAxIDAgMnoiLz48Y2lyY2xlIGZpbGw9IiNGRkNDNEQiIGN4PSIxLjQ0NyIgY3k9IjguMDQyIiByPSIxLjQwNyIvPjxjaXJjbGUgZmlsbD0iI0Y0OTAwQyIgY3g9IjYuNzUiIGN5PSI3LjU5NCIgcj0iMS4xOTIiLz48Y2lyY2xlIGZpbGw9IiNGRkNDNEQiIGN4PSIxMi4xMTMiIGN5PSIzLjUyMyIgcj0iMS43ODQiLz48Y2lyY2xlIGZpbGw9IiNGRkNDNEQiIGN4PSIzNC41NTMiIGN5PSI4LjA0MiIgcj0iMS40MDciLz48Y2lyY2xlIGZpbGw9IiNGNDkwMEMiIGN4PSIyOS4yNSIgY3k9IjcuNTk0IiByPSIxLjE5MiIvPjxjaXJjbGUgZmlsbD0iI0ZGQ0M0RCIgY3g9IjIzLjg4NyIgY3k9IjMuNTIzIiByPSIxLjc4NCIvPjxjaXJjbGUgZmlsbD0iI0Y0OTAwQyIgY3g9IjE3LjkzOCIgY3k9IjUuNTM0IiByPSIxLjc4NCIvPjwvc3ZnPg=="]
]);

export function MyRemNoteQueue({
  cards,
  width = "100%",
  maxWidth = "100%",
  onQueueComplete,
  onCardInteraction,
  initialIndex = 0,
  onCurrentIndexChange,
}: MyRemNoteQueueProps) {
  const plugin = usePlugin();

  // Filter to only cards that have a valid card object and maintain local queue order
  const [queueOrder, setQueueOrder] = useState<{ rem: Rem; card: Card }[]>([]);
  
  // Track if we've initialized from props to avoid resetting index on every render
  const [initializedFromCards, setInitializedFromCards] = useState(false);
  
  // Initialize queue order when cards prop changes
  useEffect(() => {
    const enabledCards = cards.filter((c) => c.card !== null) as { rem: Rem; card: Card }[];

    // Detect if this is a genuinely new queue (different card IDs) vs a reorder from skip/again.
    // Sorting makes the hash order-independent so reorders are ignored.
    const cardIdsHash = enabledCards.map(c => c.card!._id).sort().join(',');
    const isNewQueue = cardIdsHash !== cardIdsHashRef.current;
    cardIdsHashRef.current = cardIdsHash;

    setQueueOrder(enabledCards);
    // Use initialIndex on first load, clamp to valid range (allow length to restore completion state)
    const validIndex = Math.min(Math.max(0, initialIndex), enabledCards.length);
    setCurrentIndex(validIndex);
    setInitializedFromCards(true);

    // Only rebuild the full cardsData table when a genuinely new queue arrives.
    // Reorders (skip/again) update cardsData locally without a full rebuild.
    if (isNewQueue && enabledCards.length > 0) {
      const gen = ++cardsDataGenRef.current;
      void (async () => {
        const data: { id: string, cardId: string, text: string, nextDate: number, interval: string, intervalMs: number, lastRatings: string[] }[] = [];
        for (const item of enabledCards) {
          const text = await getRemText(plugin, item.rem);
          const freshCard = await plugin.card.findOne(item.card._id);
          const cardToUse = freshCard || item.card;
          const lastInterval = getLastInterval(cardToUse.repetitionHistory);
          const lastRatings = getLastRatingStr(cardToUse.repetitionHistory, 3);
          const interval = lastInterval ? formatMilliseconds(lastInterval.workingInterval) : '';
          data.push({
            id: item.rem._id,
            cardId: item.card._id,
            text,
            nextDate: lastInterval ? lastInterval.intervalSetOn + lastInterval.workingInterval : 0,
            interval,
            intervalMs: lastInterval ? lastInterval.workingInterval : 0,
            lastRatings,
          });
        }
        // Only apply if this is still the most recent build (no newer queue arrived)
        if (gen === cardsDataGenRef.current) {
          setCardsData(data);
        }
      })();
    }
  }, [cards]); // eslint-disable-line react-hooks/exhaustive-deps

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerState, setAnswerState] = useState<AnswerState>("question");
  const [childrenRems, setChildrenRems] = useState<Rem[]>([]);
  const [regularChildren, setRegularChildren] = useState<Rem[]>([]);
  const [extraDetailChildren, setExtraDetailChildren] = useState<Rem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Plain text for testing (to debug RemViewer rendering issue)
  const [questionText, setQuestionText] = useState("");
  const [answerTexts, setAnswerTexts] = useState<string[]>([]);
  
  // Table expansion and sorting state
  const [isListExpanded, setIsListExpanded] = useState(false);
  const [sortColumn, setSortColumn] = useState<'queue' | 'text' | 'nextDate' | 'interval' | 'lastRating'>('queue');
  const [sortAscending, setSortAscending] = useState<boolean>(true);
  const [cardsData, setCardsData] = useState<{ id: string, cardId: string, text: string, nextDate: number, interval: string, intervalMs: number, lastRatings: string[] }[]>([]);

  // Hierarchical path (breadcrumb) for current card
  const [currentPath, setCurrentPath] = useState<{ id: string; text: string; isDocument: boolean }[]>([]);
  // Whether the breadcrumb path is revealed
  const [pathRevealed, setPathRevealed] = useState(false);
  const [currentTags, setCurrentTags] = useState<{ id: string; text: string }[]>([]);
  
  // Whether to show full rating history
  const [showHistory, setShowHistory] = useState(false);

  // Predicted intervals for answer buttons
  const [predictedIntervals, setPredictedIntervals] = useState<{
    again: string;
    hard: string;
    good: string;
    easy: string;
  }>({ again: '', hard: '', good: '', easy: '' });
  
  // Card type (forward, backward, or cloze)
  const [cardType, setCardType] = useState<CardType>('forward');
  
  // Parent rem's hint (used for backward cards to show the same hint as forward)
  const [parentHint, setParentHint] = useState<string | undefined>(undefined);
  
  // Property card state: when a rem has a "Property" tag, show parent as main question
  const [isPropertyCard, setIsPropertyCard] = useState<boolean>(false);
  const [propertyParentRemId, setPropertyParentRemId] = useState<string | undefined>(undefined);
  
  // LaTeX cloze card state: when a rem's text contains {{c1::...}} in LaTeX
  const [hasLatexCloze, setHasLatexCloze] = useState<boolean>(false);
  
  // Property parent LaTeX cloze state: when the property parent's text has cloze
  const [propertyParentHasLatexCloze, setPropertyParentHasLatexCloze] = useState<boolean>(false);

  // Track whether the current cards prop represents a new queue (different card IDs)
  // vs a reorder (skip/again from parent). Used to skip unnecessary table rebuilds.
  const cardIdsHashRef = useRef<string>("");
  // Generation counter — incremented on each new queue build to cancel stale async loads
  const cardsDataGenRef = useRef<number>(0);
  // Pending rating: stored when a card is rated, fired after the next card's loadContent
  // finishes so updateCardRepetitionStatus doesn't block bridge calls during content load.
  const pendingRatingRef = useRef<{ cardId: string; score: QueueInteractionScore } | null>(null);
  // True while a deferred updateCardRepetitionStatus call is in-flight; disables rating buttons.
  const [isRatingInFlight, setIsRatingInFlight] = useState(false);

  const currentCardData = queueOrder[currentIndex];

  // Sorting handlers
  const handleSort = (column: 'queue' | 'text' | 'nextDate' | 'interval' | 'lastRating') => {
    console.log('[Sort] handleSort called | column:', column, '| current sortColumn:', sortColumn, '| sortAscending:', sortAscending, '| cardsData.length:', cardsData.length);
    if (sortColumn === column) {
      console.log('[Sort] Toggling direction → new sortAscending will be:', !sortAscending);
      setSortAscending(!sortAscending);
    } else {
      console.log('[Sort] Switching column →', column, '(sortAscending → true)');
      setSortColumn(column);
      setSortAscending(true);
    }
  };

  // Debug: log whenever sort state actually changes
  useEffect(() => {
    console.log('[Sort] Sort state updated → sortColumn:', sortColumn, '| sortAscending:', sortAscending);
  }, [sortColumn, sortAscending]);

  // Timing: log whenever currentIndex changes
  useEffect(() => {
    console.log(`[TIMING] currentIndex changed → ${currentIndex}`);
  }, [currentIndex]);

  const ratingOrder: Record<string, number> = {
    'Easily recalled': 4,
    'Recalled with effort': 3,
    'Partially recalled': 2,
    'Forgot': 1,
    'Reset': 0,
    '': -1,
  };

  const getSortedCardsData = () => {
    console.log('[Sort] getSortedCardsData called → sortColumn:', sortColumn, '| sortAscending:', sortAscending, '| cardsData.length:', cardsData.length);
    // If sorting by queue order, return data in original order (or reversed)
    if (sortColumn === 'queue') {
      const result = sortAscending ? [...cardsData] : [...cardsData].reverse();
      console.log('[Sort] queue order result ids (last 6):', result.map(c => c.id.slice(-6)));
      return result;
    }
    const sorted = [...cardsData].sort((a, b) => {
      let comparison = 0;
      switch (sortColumn) {
        case 'text':
          comparison = a.text.localeCompare(b.text, undefined, { numeric: true });
          break;
        case 'nextDate':
          comparison = a.nextDate - b.nextDate;
          break;
        case 'interval':
          comparison = a.intervalMs - b.intervalMs;
          break;
        case 'lastRating':
          const ratingA = ratingOrder[a.lastRatings[0]] ?? -1;
          const ratingB = ratingOrder[b.lastRatings[0]] ?? -1;
          comparison = ratingA - ratingB;
          break;
      }
      return sortAscending ? comparison : -comparison;
    });
    console.log('[Sort] sorted result texts:', sorted.map(c => c.text.slice(0, 20)));
    return sorted;
  };

  const openRem = async (id: string) => {
    const rem = await plugin.rem.findOne(id);
    if (rem) {
      await plugin.window.openRem(rem);
    }
  };

  const toggleListExpanded = () => {
    setIsListExpanded(!isListExpanded);
  };

  // Calculate predicted intervals when card changes
  useEffect(() => {
    if (currentCardData?.card) {
      const history = currentCardData.card.repetitionHistory;
      setPredictedIntervals({
        again: formatMilliseconds(calculateNextInterval(history, QueueInteractionScore.AGAIN)),
        hard: formatMilliseconds(calculateNextInterval(history, QueueInteractionScore.HARD)),
        good: formatMilliseconds(calculateNextInterval(history, QueueInteractionScore.GOOD)),
        easy: formatMilliseconds(calculateNextInterval(history, QueueInteractionScore.EASY)),
      });
    } else {
      setPredictedIntervals({ again: '', hard: '', good: '', easy: '' });
    }
  }, [currentCardData?.card]);

  // Load children when card changes
  useEffect(() => {
    // Do NOT clear childrenRems/regularChildren/extraDetailChildren here — keep the
    // previous card's answer mounted (hidden via display:none) so RemViewers stay
    // alive while the new card loads. They are replaced once loadContent finishes.
    setQuestionText("");
    setAnswerTexts([]);
    setCurrentPath([]);
    setPathRevealed(false);
    setCurrentTags([]);
    setCardType('forward'); // Reset to forward by default
    setParentHint(undefined);
    setIsPropertyCard(false);
    setPropertyParentRemId(undefined);
    setHasLatexCloze(false);
    setPropertyParentHasLatexCloze(false);
    // Do not set isLoading=true here — only the initial render uses the loading gate.
    // Subsequent card switches show content inline via RemViewer's own loading states.
    
    async function loadContent() {
      if (!currentCardData || !currentCardData.card || !currentCardData.rem?._id) {
        // Fire any deferred rating (e.g., last card in queue rated then queue completes)
        const _pending0 = pendingRatingRef.current;
        if (_pending0) {
          pendingRatingRef.current = null;
          void (async () => {
            try {
              const fc = await plugin.card.findOne(_pending0.cardId);
              if (fc) await fc.updateCardRepetitionStatus(_pending0.score);
              void updateSingleCardData(_pending0.cardId);
            } catch (e) { console.error("Error updating card status (deferred):", e); }
            finally { setIsRatingInFlight(false); }
          })();
        }
        setIsLoading(false);
        return;
      }

      const _lc_t0 = performance.now();
      const _lc_remId = currentCardData.rem._id;
      console.log(`[TIMING] loadContent START remId=...${_lc_remId.slice(-6)} index=${currentIndex}`);

      try {
        // Synchronous operations (local properties, no SDK calls)
        setHasLatexCloze(detectRichTextLatexCloze(currentCardData.rem.text));
        setParentHint(extractHintFromBackText(currentCardData.rem.backText, 'back'));

        // Round 1: all independent async calls in parallel
        const _r1_t0 = performance.now();
        const _r1_t_findOne = performance.now();
        const _r1_t_getType = performance.now();
        const _r1_t_getRemText = performance.now();
        const _r1_t_getRemPath = performance.now();
        const _r1_t_getCleanTags = performance.now();
        const _r1_t_getCleanChildren = performance.now();
        const [freshCard, remType, qText, path, tagRems, children] = await Promise.all([
          plugin.card.findOne(currentCardData.card._id).then(r => { console.log(`[TIMING] R1 card.findOne: ${(performance.now()-_r1_t_findOne).toFixed(1)}ms`); return r; }),
          currentCardData.rem.getType().then(r => { console.log(`[TIMING] R1 rem.getType: ${(performance.now()-_r1_t_getType).toFixed(1)}ms`); return r; }),
          getRemText(plugin, currentCardData.rem).then(r => { console.log(`[TIMING] R1 getRemText: ${(performance.now()-_r1_t_getRemText).toFixed(1)}ms`); return r; }),
          getRemPath(plugin, currentCardData.rem).then(r => { console.log(`[TIMING] R1 getRemPath: ${(performance.now()-_r1_t_getRemPath).toFixed(1)}ms`); return r; }),
          getCleanTags(plugin, currentCardData.rem).then(r => { console.log(`[TIMING] R1 getCleanTags: ${(performance.now()-_r1_t_getCleanTags).toFixed(1)}ms`); return r; }),
          getCleanChildren(plugin, currentCardData.rem).then(r => { console.log(`[TIMING] R1 getCleanChildren: ${(performance.now()-_r1_t_getCleanChildren).toFixed(1)}ms`); return r; }),
        ]);
        console.log(`[TIMING] R1 TOTAL: ${(performance.now()-_r1_t0).toFixed(1)}ms`);

        if (!freshCard) {
          // Fire any deferred rating even on early return
          const _pending1 = pendingRatingRef.current;
          if (_pending1) {
            pendingRatingRef.current = null;
            void (async () => {
              try {
                const fc = await plugin.card.findOne(_pending1.cardId);
                if (fc) await fc.updateCardRepetitionStatus(_pending1.score);
                void updateSingleCardData(_pending1.cardId);
              } catch (e) { console.error("Error updating card status (deferred):", e); }
              finally { setIsRatingInFlight(false); }
            })();
          }
          setIsLoading(false);
          return;
        }

        // Round 2: calls that depend on round-1 results — run in parallel
        const _r2_t0 = performance.now();
        const _r2_t_getType = performance.now();
        const _r2_t_getParentRem = performance.now();
        const _r2_t_tagTexts = performance.now();
        const _r2_t_childData = performance.now();
        const [type, descriptorParent, tagTexts, childData] = await Promise.all([
          freshCard.getType().then(r => { console.log(`[TIMING] R2 freshCard.getType: ${(performance.now()-_r2_t_getType).toFixed(1)}ms`); return r; }),
          remType === RemType.DESCRIPTOR
            ? currentCardData.rem.getParentRem().then(r => { console.log(`[TIMING] R2 getParentRem: ${(performance.now()-_r2_t_getParentRem).toFixed(1)}ms`); return r; })
            : Promise.resolve(null as Rem | null | undefined),
          Promise.all(tagRems.map(tagRem => getRemText(plugin, tagRem))).then(r => { console.log(`[TIMING] R2 tagTexts (${tagRems.length}): ${(performance.now()-_r2_t_tagTexts).toFixed(1)}ms`); return r; }),
          Promise.all(children.map(async (child) => {
            if (!child?._id) return { hasExtraCardDetail: false, isDescriptor: true, text: '' };
            const _tc = performance.now();
            const [hasExtraCardDetail, childType, childText] = await Promise.all([
              child.hasPowerup(BuiltInPowerupCodes.ExtraCardDetail),
              child.getType(),
              getRemText(plugin, child),
            ]);
            console.log(`[TIMING] R2 child[...${child._id.slice(-4)}] hasPowerup+getType+getRemText: ${(performance.now()-_tc).toFixed(1)}ms`);
            return { hasExtraCardDetail, isDescriptor: childType === RemType.DESCRIPTOR, text: childText };
          })).then(r => { console.log(`[TIMING] R2 childData (${children.length} children): ${(performance.now()-_r2_t_childData).toFixed(1)}ms`); return r; }),
        ]);
        console.log(`[TIMING] R2 TOTAL: ${(performance.now()-_r2_t0).toFixed(1)}ms`);

        // Apply state updates
        setCardType(type);
        setQuestionText(qText);
        setCurrentPath(path);

        // Handle DESCRIPTOR property card (reuse qText instead of fetching again)
        if (remType === RemType.DESCRIPTOR) {
          const excludedDescriptors = ['extends', 'implements', 'eigenschaften'];
          if (!excludedDescriptors.includes(qText.toLowerCase()) && descriptorParent) {
            setIsPropertyCard(true);
            setPropertyParentRemId(descriptorParent._id);
            setPropertyParentHasLatexCloze(detectRichTextLatexCloze(descriptorParent.text));
          }
        }

        // Tags
        const tags = tagRems.map((tagRem, i) => ({ id: tagRem._id, text: tagTexts[i] }));
        setCurrentTags(tags.filter(tag => tag.text.trim().length > 0));

        // Children
        setChildrenRems(children);
        const regular: Rem[] = [];
        const extraDetail: Rem[] = [];
        for (let i = 0; i < children.length; i++) {
          if (childData[i].hasExtraCardDetail) {
            extraDetail.push(children[i]);
          } else if (!childData[i].isDescriptor) {
            regular.push(children[i]);
          }
        }
        setRegularChildren(regular);
        setExtraDetailChildren(extraDetail);
        setAnswerTexts(childData.map(cd => cd.text));

      } catch (error) {
        console.error("[MyRemNoteQueue] Error loading content:", error);
        setChildrenRems([]);
        setRegularChildren([]);
        setExtraDetailChildren([]);
        setQuestionText("");
        setAnswerTexts([]);
        setCurrentTags([]);
      }
      console.log(`[TIMING] loadContent END remId=...${_lc_remId.slice(-6)} TOTAL: ${(performance.now()-_lc_t0).toFixed(1)}ms`);
      setIsLoading(false);
      // Fire deferred rating now that the new card's content has loaded
      const _pending2 = pendingRatingRef.current;
      if (_pending2) {
        pendingRatingRef.current = null;
        void (async () => {
          try {
            const _pr_t0 = performance.now();
            const fc = await plugin.card.findOne(_pending2.cardId);
            console.log(`[TIMING] pendingRating card.findOne: ${(performance.now()-_pr_t0).toFixed(1)}ms`);
            if (fc) {
              const _pr_t1 = performance.now();
              await fc.updateCardRepetitionStatus(_pending2.score);
              console.log(`[TIMING] pendingRating updateCardRepetitionStatus: ${(performance.now()-_pr_t1).toFixed(1)}ms`);
            }
            void updateSingleCardData(_pending2.cardId);
          } catch (e) { console.error("Error updating card status (deferred):", e); }
          finally { setIsRatingInFlight(false); }
        })();
      }
    }

    loadContent();
    setAnswerState("question");
    setShowHistory(false);
  }, [currentIndex, currentCardData?.rem._id, plugin]);

  const handleShowAnswer = () => {
    setAnswerState("answer");
  };

  // Update only the single rated card's entry in cardsData (background, non-blocking)
  const updateSingleCardData = async (cardId: string) => {
    const _usd_t0 = performance.now();
    const item = queueOrder.find(i => i.card._id === cardId);
    if (!item) return;
    const _usd_t1 = performance.now();
    const freshCard = await plugin.card.findOne(cardId);
    console.log(`[TIMING] updateSingleCardData card.findOne: ${(performance.now()-_usd_t1).toFixed(1)}ms`);
    const cardToUse = freshCard || item.card;
    const lastInterval = getLastInterval(cardToUse.repetitionHistory);
    const lastRatings = getLastRatingStr(cardToUse.repetitionHistory, 3);
    setCardsData(prev => prev.map(c =>
      c.cardId === cardId ? {
        ...c,
        nextDate: lastInterval ? lastInterval.intervalSetOn + lastInterval.workingInterval : 0,
        interval: lastInterval ? formatMilliseconds(lastInterval.workingInterval) : '',
        intervalMs: lastInterval ? lastInterval.workingInterval : 0,
        lastRatings,
      } : c
    ));
    console.log(`[TIMING] updateSingleCardData TOTAL: ${(performance.now()-_usd_t0).toFixed(1)}ms`);
  };

  const handleAnswer = (score: QueueInteractionScore) => {
    // Store rating to apply after the next card's loadContent finishes,
    // so updateCardRepetitionStatus doesn't block bridge calls during content load.
    if (currentCardData?.card) {
      pendingRatingRef.current = { cardId: currentCardData.card._id, score };
      setIsRatingInFlight(true);
    }
    // Navigate immediately for instant feedback
    goToNextCard();
  };

  const handleAgain = () => {
    // Store rating to apply after the next card's loadContent finishes,
    // so updateCardRepetitionStatus doesn't block bridge calls during content load.
    if (currentCardData?.card) {
      pendingRatingRef.current = { cardId: currentCardData.card._id, score: QueueInteractionScore.AGAIN };
      setIsRatingInFlight(true);
    }

    // Move card to random position in second half of remaining queue immediately
    if (currentCardData && queueOrder.length > 1) {
      const newQueue = [...queueOrder];
      const [againCard] = newQueue.splice(currentIndex, 1);

      // Calculate second half range of remaining cards
      const remainingCards = newQueue.length - currentIndex;
      const halfPoint = Math.ceil(remainingCards / 2);
      const insertStart = currentIndex + halfPoint;
      const insertEnd = newQueue.length; // splice at length = append

      // Random position in second half (insertStart to insertEnd inclusive)
      const insertPosition = insertStart + Math.floor(Math.random() * (insertEnd - insertStart + 1));

      newQueue.splice(insertPosition, 0, againCard);
      setQueueOrder(newQueue);
      // Sync cardsData order to match new queue — no full rebuild needed
      setCardsData(prev => {
        const cardMap = new Map(prev.map(cd => [cd.cardId, cd]));
        return newQueue.map(qi => cardMap.get(qi.card._id)).filter(Boolean) as typeof prev;
      });

      // Notify parent of card interaction
      if (onCardInteraction) {
        onCardInteraction(newQueue);
      }

      // Stay at same index (next card shifted into current position)
      if (currentIndex >= newQueue.length) {
        setCurrentIndex(newQueue.length - 1);
      }
      setAnswerState("question");

      // Edge case: if the card was re-inserted at the same position (e.g., last card in queue),
      // currentCardData won't change and loadContent won't re-run — fire the pending rating now.
      const effectiveIndex = Math.min(currentIndex, newQueue.length - 1);
      if (newQueue[effectiveIndex]?.card._id === currentCardData.card._id) {
        const _p = pendingRatingRef.current;
        if (_p) {
          pendingRatingRef.current = null;
          void (async () => {
            try {
              const fc = await plugin.card.findOne(_p.cardId);
              if (fc) await fc.updateCardRepetitionStatus(_p.score);
              void updateSingleCardData(_p.cardId);
            } catch (e) { console.error("Error updating card status (same-card again):", e); }
            finally { setIsRatingInFlight(false); }
          })();
        }
      }
      } else {
      // Only one card left, just advance (will complete the queue)
      goToNextCard();
    }
  };

  const goToNextCard = useCallback(() => {
    if (currentIndex < queueOrder.length - 1) {
      const newIndex = currentIndex + 1;
      setCurrentIndex(newIndex);
      setAnswerState("question");
      // Notify parent of index change
      if (onCurrentIndexChange) {
        onCurrentIndexChange(newIndex);
      }
    } else {
      // Queue complete - increment index past the end to show completion state
      setCurrentIndex(queueOrder.length);
      if (onCurrentIndexChange) {
        onCurrentIndexChange(queueOrder.length);
      }
      if (onQueueComplete) {
        onQueueComplete();
      }
    }
  }, [currentIndex, queueOrder.length, onQueueComplete, onCurrentIndexChange]);

  const handleSkip = () => {
    // Move current card to the back of the queue
    if (currentCardData && queueOrder.length > 1) {
      const newQueue = [...queueOrder];
      const [skippedCard] = newQueue.splice(currentIndex, 1);
      newQueue.push(skippedCard);
      setQueueOrder(newQueue);
      // Sync cardsData order to match new queue — no full rebuild needed
      setCardsData(prev => {
        const cardMap = new Map(prev.map(cd => [cd.cardId, cd]));
        return newQueue.map(qi => cardMap.get(qi.card._id)).filter(Boolean) as typeof prev;
      });
      // Notify parent of card interaction so it can persist to storage
      if (onCardInteraction) {
        onCardInteraction(newQueue);
      }
      // Keep the same index to show the next card (which shifted into current position)
      // But if we were at the last card, stay at the new last position
      if (currentIndex >= newQueue.length) {
        setCurrentIndex(newQueue.length - 1);
      }
      setAnswerState("question");
    } else {
      // Only one card left, just reset to question state
      setAnswerState("question");
    }
  };

  // Container style with dynamic width/maxWidth
  const containerStyle: React.CSSProperties = {
    ...containerBaseStyle,
    width,
    maxWidth,
  };

  // Render
  if (queueOrder.length === 0) {
    return (
      <div style={containerStyle}>
        <div style={messageStyle}>
          No cards to review.
        </div>
      </div>
    );
  }

  if (currentIndex >= queueOrder.length) {
    return (
      <div style={containerStyle}>
        <div style={successMessageStyle}>
          🎉 Queue complete! All cards reviewed.
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={containerStyle}>
        <div style={messageStyle}>Loading...</div>
      </div>
    );
  }

  if (!currentCardData) {
    return (
      <div style={containerStyle}>
        <div style={messageStyle}>
          <div>Error loading card.</div>
          <button onClick={goToNextCard} style={{...skipButtonStyle, marginTop: "8px"}}>
            Skip to next
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Progress indicator - clickable to expand/collapse table */}
      <div style={progressButtonStyle}>
        <MyRemNoteButtonSmall 
          text={`Card ${currentIndex + 1} of ${queueOrder.length}`} 
          onClick={toggleListExpanded} 
        />
      </div>

      {/* Expandable cards table */}
      {isListExpanded && (
        <div style={{ marginTop: "10px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "10px", tableLayout: "fixed", fontSize: "12px" }}>
            <thead>
              <tr>
                <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left", width: "5%" }}>
                  <MyRemNoteButtonSmall text={`# ${sortColumn === 'queue' ? (sortAscending ? '▲' : '▼') : ''}`} onClick={() => handleSort('queue')} />
                </th>
                <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left", width: "55%" }}>
                  <MyRemNoteButtonSmall text={`Question ${sortColumn === 'text' ? (sortAscending ? '▲' : '▼') : ''}`} onClick={() => handleSort('text')} />
                </th>
                <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left", width: "15%" }}>
                  <MyRemNoteButtonSmall text={`Next Date ${sortColumn === 'nextDate' ? (sortAscending ? '▲' : '▼') : ''}`} onClick={() => handleSort('nextDate')} />
                </th>
                <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left", width: "15%" }}>
                  <MyRemNoteButtonSmall text={`Interval ${sortColumn === 'interval' ? (sortAscending ? '▲' : '▼') : ''}`} onClick={() => handleSort('interval')} />
                </th>
                <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left", width: "10%" }}>
                  <MyRemNoteButtonSmall text={`Last Rating ${sortColumn === 'lastRating' ? (sortAscending ? '▲' : '▼') : ''}`} onClick={() => handleSort('lastRating')} />
                </th>
              </tr>
            </thead>
            <tbody>
              {getSortedCardsData().map((c, index) => {
                const queuePosition = cardsData.findIndex(card => card.cardId === c.cardId);
                const isCurrentCard = queuePosition === currentIndex;
                const highlightStyle: React.CSSProperties = isCurrentCard 
                  ? { border: "1px solid #ddd", padding: 8, textAlign: "center", backgroundColor: "var(--highlight-color, rgba(74, 144, 217, 0.3))" } 
                  : { border: "1px solid #ddd", padding: 8, textAlign: "center" };
                return (
                <tr key={c.cardId}>
                  <td style={highlightStyle}>
                    {queuePosition + 1}
                  </td>
                  <td style={{ border: "1px solid #ddd", padding: 8 }}>
                    <MyRemNoteButtonSmallById remId={c.id} onClick={() => openRem(c.id)} />
                  </td>
                  <td style={{ border: "1px solid #ddd", padding: 8 }}>{formatMilliseconds(c.nextDate - Date.now())}</td>
                  <td style={{ border: "1px solid #ddd", padding: 8 }}>{c.interval}</td>
                  <td style={{ border: "1px solid #ddd", padding: 8, textAlign: "center" }}>
                    {c.lastRatings.length > 0 && (
                      c.lastRatings.slice().reverse().map((rating, index) => (
                        <img
                          key={index}
                          style={{ width: '16px', height: '16px', marginRight: index < c.lastRatings.length - 1 ? '3px' : '0' }}
                          src={scoreToImage.get(rating)}
                        />
                      ))
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Card content */}
      <div style={cardContainerStyle}>
        {/* Hierarchical path breadcrumb (excluding current card) */}
        {currentPath.length > 1 && (
          <div 
            style={{...breadcrumbContainerStyle, cursor: pathRevealed ? "default" : "pointer"}}
            onClick={() => !pathRevealed && setPathRevealed(true)}
            title={pathRevealed ? undefined : "Click to reveal path"}
          >
            {currentPath.slice(0, -1).map((item, index, arr) => (
              <span key={item.id} style={{ display: "flex", alignItems: "center" }}>
                {index > 0 && <span style={breadcrumbSeparatorStyle}>›</span>}
                <span 
                  style={{...breadcrumbItemStyle, display: "flex", alignItems: "center", gap: "4px", cursor: pathRevealed ? "pointer" : "inherit"}} 
                  onClick={(e) => {
                    if (pathRevealed) {
                      e.stopPropagation();
                      openRem(item.id);
                    }
                  }}
                  title={pathRevealed ? `Open "${item.text}"` : undefined}
                >
                  {pathRevealed && item.isDocument && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 7h14M5 12h14M5 17h10" />
                    </svg>
                  )}
                  {pathRevealed ? item.text : "|||||"}
                </span>
              </span>
            ))}
          </div>
        )}

        {currentTags.length > 0 && (
          <div style={tagListStyle}>
            {currentTags.map((tag) => (
              <span key={tag.id} style={tagChipStyle}>
                {tag.text}
              </span>
            ))}
          </div>
        )}

        {/* Question (Front for forward cards, Back/children for backward cards) */}
        <div style={questionStyle}>
          {cardType === 'backward' ? (
            // Backward card: show children as the question
            childrenRems.length > 0 ? (
              <>
                {regularChildren.map((childRem) => (
                  <div key={`question-${childRem._id}`} style={childRemStyle}>
                    <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px' }}>
                      <MyRemnoteRemViewer 
                        remId={childRem._id}
                        loadingText="(loading...)"
                        notFoundText="(not found)"
                        externalHint={parentHint}
                      />
                      {/* For Property backward cards, show current rem name in parentheses */}
                      {isPropertyCard && <span style={{ opacity: 0.7 }}>({questionText})</span>}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div style={noContentStyle}>
                No question content (no children found)
              </div>
            )
          ) : isPropertyCard && propertyParentRemId ? (
            // Property card: show parent rem with current rem name in parentheses
            <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px' }}>
              <MyRemnoteRemViewer 
                remId={propertyParentRemId} 
                showChildren={false}
                loadingText="(loading...)"
                notFoundText="(not found)"
                externalHint={parentHint}
                clozeMode={propertyParentHasLatexCloze ? 'answer' : undefined}
              />
              <span style={{ opacity: 0.7 }}>({questionText})</span>
            </div>
          ) : (
            // Forward card (or cloze): show the rem itself as the question, hint about back/answer
            <MyRemnoteRemViewer 
              remId={currentCardData.rem._id} 
              showChildren={false}
              loadingText="(loading question...)"
              notFoundText="(question not found)"
              externalHint={parentHint}
              clozeMode={hasLatexCloze ? 'question' : undefined}
            />
          )}
        </div>

        {/* Answer (Back/children for forward cards, Front/rem for backward cards) */}
        {/* Always mounted so RemViewers load in the background; visibility toggled via display */}
        <div style={{ ...answerStyle, display: answerState === "answer" ? "block" : "none" }}>
            {cardType === 'backward' ? (
              // Backward card: show the rem itself as the answer (or parent for Property cards)
              <>
                {isPropertyCard && propertyParentRemId ? (
                  // Property backward card: show parent rem as the answer
                  <MyRemnoteRemViewer 
                    remId={propertyParentRemId} 
                    showChildren={false}
                    loadingText="(loading answer...)"
                    notFoundText="(answer not found)"
                    clozeMode={propertyParentHasLatexCloze ? 'answer' : undefined}
                  />
                ) : (
                  // Regular backward card: show the rem itself as the answer
                  <MyRemnoteRemViewer 
                    remId={currentCardData.rem._id} 
                    showChildren={false}
                    loadingText="(loading answer...)"
                    notFoundText="(answer not found)"
                  />
                )}
                
                {/* Show extra card details below the answer if any */}
                {extraDetailChildren.length > 0 && (
                  <>
                    <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid var(--border-color, #ccc)" }} />
                    {extraDetailChildren.map((childRem) => (
                      <div key={`extra-${childRem._id}`} style={childRemStyle}>
                        <MyRemnoteRemViewer 
                          remId={childRem._id}
                          loadingText="(loading...)"
                          notFoundText="(not found)"
                        />
                      </div>
                    ))}
                  </>
                )}
              </>
            ) : (
              // Forward card (or cloze): show children as the answer
              // For LaTeX cloze cards, also show the rem text with cloze revealed
              <>
                {/* For LaTeX cloze cards, show the rem text with cloze content revealed */}
                {hasLatexCloze && (
                  <div style={{ marginBottom: '12px' }}>
                    <MyRemnoteRemViewer 
                      remId={currentCardData.rem._id}
                      showChildren={false}
                      loadingText="(loading answer...)"
                      notFoundText="(answer not found)"
                      clozeMode="answer"
                    />
                  </div>
                )}
                
                {/* Show children if any (as additional info or regular answer) */}
                {childrenRems.length > 0 ? (
                  <>
                    {/* Regular answers (without Extra Card Detail powerup) */}
                    {regularChildren.map((childRem) => (
                      <div key={`answer-${childRem._id}`} style={childRemStyle}>
                        <MyRemnoteRemViewer 
                          remId={childRem._id}
                          loadingText="(loading...)"
                          notFoundText="(not found)"
                        />
                      </div>
                    ))}
                    
                    {/* Horizontal separator if there are extra card details */}
                    {extraDetailChildren.length > 0 && (
                      <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid var(--border-color, #ccc)" }} />
                    )}
                    
                    {/* Extra Card Detail answers */}
                    {extraDetailChildren.map((childRem) => (
                      <div key={`extra-${childRem._id}`} style={childRemStyle}>
                        <MyRemnoteRemViewer 
                          remId={childRem._id}
                          loadingText="(loading...)"
                          notFoundText="(not found)"
                        />
                      </div>
                    ))}
                  </>
                ) : (
                  // Only show "no answer content" if there's no LaTeX cloze either
                  !hasLatexCloze && (
                    <div style={noContentStyle}>
                      No answer content (no children found)
                    </div>
                  )
                )}
              </>
            )}
          </div>
      </div>

      {/* Buttons */}
      {answerState === "question" ? (
        <button style={showAnswerButtonStyle} onClick={handleShowAnswer}>
          Show Answer
        </button>
      ) : (
        <>
          {(() => {
            const history = currentCardData.card.repetitionHistory;
            const lastInterval = getLastInterval(history);
            let mainBlock: React.ReactNode;
            if (lastInterval) {
              const nextDate = lastInterval.intervalSetOn + lastInterval.workingInterval;
              const isEarlyReview = nextDate > Date.now();
              const daysAgo = Math.round((Date.now() - lastInterval.intervalSetOn) / (1000 * 60 * 60 * 24));
              const intervalStr = formatMilliseconds(lastInterval.workingInterval, true);
              const message = `Last Interval (${intervalStr}) set ${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago.`;
              mainBlock = isEarlyReview ? (
                <div style={earlyReviewStyle}>Early Review! {message}</div>
              ) : (
                <div style={lastIntervalStyle}>{message}</div>
              );
            } else {
              mainBlock = <div style={lastIntervalStyle}>New Card!</div>;
            }
            const allRatings = getLastRatingStr(history, history ? history.length : 0).slice().reverse();
            return (
              <>
                {mainBlock}
                <div style={{ textAlign: 'center', marginTop: '4px' }}>
                  <span
                    style={{ fontSize: '12px', cursor: 'pointer', color: 'var(--text-link, #4a90d9)', userSelect: 'none' }}
                    onClick={() => setShowHistory(h => !h)}
                  >
                    {showHistory ? 'Hide History' : 'Show History'}
                  </span>
                  {showHistory && (
                    <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '3px', marginTop: '6px' }}>
                      {allRatings.length > 0 ? allRatings.map((rating, index) => (
                        <img
                          key={index}
                          style={{ width: '16px', height: '16px' }}
                          src={scoreToImage.get(rating)}
                          alt={rating}
                          title={rating}
                        />
                      )) : (
                        <span style={{ fontSize: '12px', opacity: 0.5 }}>No history yet.</span>
                      )}
                    </div>
                  )}
                </div>
              </>
            );
          })()}
          <div style={buttonContainerStyle}>
            <button style={skipButtonStyle} onClick={handleSkip} title="Moves the card to the back of the queue without rating it.">
              Skip
            </button>
            <button
              style={{...forgetButtonStyle, display: 'flex', alignItems: 'center', gap: '6px', ...(isRatingInFlight ? { opacity: 0.5, cursor: 'not-allowed' } : {})}}
              onClick={handleAgain}
              disabled={isRatingInFlight}
              title={isRatingInFlight ? "Waiting for previous rating to finish…" : "Moves the card to somewhere later in the queue."}
            >
              <img src={scoreToImage.get("Forgot")} alt="Forgot" style={{ width: '20px', height: '20px' }} />
              {/*{predictedIntervals.again}*/}
            </button>
            <button
              style={{...partialButtonStyle, display: 'flex', alignItems: 'center', gap: '6px', ...(isRatingInFlight ? { opacity: 0.5, cursor: 'not-allowed' } : {})}}
              onClick={() => handleAnswer(QueueInteractionScore.HARD)}
              disabled={isRatingInFlight}
              title={isRatingInFlight ? "Waiting for previous rating to finish…" : undefined}
            >
              <img src={scoreToImage.get("Partially recalled")} alt="Partially Recalled" style={{ width: '20px', height: '20px' }} />
              {predictedIntervals.hard}
            </button>
            <button
              style={{...recalledButtonStyle, display: 'flex', alignItems: 'center', gap: '6px', ...(isRatingInFlight ? { opacity: 0.5, cursor: 'not-allowed' } : {})}}
              onClick={() => handleAnswer(QueueInteractionScore.GOOD)}
              disabled={isRatingInFlight}
              title={isRatingInFlight ? "Waiting for previous rating to finish…" : undefined}
            >
              <img src={scoreToImage.get("Recalled with effort")} alt="Recalled With Effort" style={{ width: '20px', height: '20px' }} />
              {predictedIntervals.good}
            </button>
            <button
              style={{...easyButtonStyle, display: 'flex', alignItems: 'center', gap: '6px', ...(isRatingInFlight ? { opacity: 0.5, cursor: 'not-allowed' } : {})}}
              onClick={() => handleAnswer(QueueInteractionScore.EASY)}
              disabled={isRatingInFlight}
              title={isRatingInFlight ? "Waiting for previous rating to finish…" : undefined}
            >
              <img src={scoreToImage.get("Easily recalled")} alt="Easily Recalled" style={{ width: '20px', height: '20px' }} />
              {predictedIntervals.easy}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default MyRemNoteQueue;
