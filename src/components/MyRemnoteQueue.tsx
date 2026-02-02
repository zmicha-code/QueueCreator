import {
  usePlugin,
  Card,
  Rem,
  QueueInteractionScore,
  RNPlugin,
  RepetitionStatus,
  BuiltInPowerupCodes,
} from "@remnote/plugin-sdk";
import { useState, useEffect, useCallback } from "react";
import { SearchData, getRemText } from "../widgets/customQueueWidget";
import { MyRemNoteButtonSmall } from "./MyRemnoteButton";
import { MyRemnoteRemViewer } from "./MyRemnoteRemViewer";

interface MyRemNoteQueueProps {
  /** Array of card data objects containing rem and card */
  cards: SearchData[];
  width?: string | number;
  maxWidth?: string | number;
  onQueueComplete?: () => void;
  /** Callback when queue order changes (e.g., card skipped or answered) */
  onQueueOrderChange?: (newOrder: SearchData[]) => void;
  /** Initial index to start from (for restoring position after tab switch) */
  initialIndex?: number;
  /** Callback when current index changes */
  onCurrentIndexChange?: (newIndex: number) => void;
  /** Callback when a card is rated (to refresh display data) */
  onCardRated?: () => void;
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
};

const cardContainerStyle: React.CSSProperties = {
  border: "1px solid var(--border-color, #ddd)",
  borderRadius: "8px",
  padding: "16px",
  minHeight: "200px",
  position: "relative",
  overflow: "hidden",
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

// Helper function to get the hierarchical path of a Rem
async function getRemPath(plugin: RNPlugin, rem: Rem): Promise<{ id: string; text: string }[]> {
  const path: { id: string; text: string }[] = [];
  let currentRem: Rem | undefined = rem;
  
  // Traverse up the hierarchy
  while (currentRem) {
    const text = await getRemText(plugin, currentRem);
    path.unshift({ id: currentRem._id, text: text || "(untitled)" });
    currentRem = await currentRem.getParentRem();
  }
  
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
  onQueueOrderChange,
  initialIndex = 0,
  onCurrentIndexChange,
  onCardRated,
}: MyRemNoteQueueProps) {
  const plugin = usePlugin();

  // Filter to only cards that have a valid card object and maintain local queue order
  const [queueOrder, setQueueOrder] = useState<{ rem: Rem; card: Card }[]>([]);
  
  // Track if we've initialized from props to avoid resetting index on every render
  const [initializedFromCards, setInitializedFromCards] = useState(false);
  
  // Initialize queue order when cards prop changes
  useEffect(() => {
    const enabledCards = cards.filter((c) => c.card !== null) as { rem: Rem; card: Card }[];
    setQueueOrder(enabledCards);
    // Use initialIndex on first load, clamp to valid range
    const validIndex = Math.min(Math.max(0, initialIndex), Math.max(0, enabledCards.length - 1));
    setCurrentIndex(validIndex);
    setInitializedFromCards(true);
  }, [cards]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerState, setAnswerState] = useState<AnswerState>("question");
  const [childrenRems, setChildrenRems] = useState<Rem[]>([]);
  const [regularChildren, setRegularChildren] = useState<Rem[]>([]);
  const [extraDetailChildren, setExtraDetailChildren] = useState<Rem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Render key to force complete re-render of RemViewer components
  const [renderKey, setRenderKey] = useState(0);
  // Plain text for testing (to debug RemViewer rendering issue)
  const [questionText, setQuestionText] = useState("");
  const [answerTexts, setAnswerTexts] = useState<string[]>([]);
  
  // Table expansion and sorting state
  const [isListExpanded, setIsListExpanded] = useState(false);
  const [sortColumn, setSortColumn] = useState<'queue' | 'text' | 'nextDate' | 'interval' | 'lastRating'>('queue');
  const [sortAscending, setSortAscending] = useState<boolean>(true);
  const [cardsData, setCardsData] = useState<{ id: string, text: string, nextDate: number, interval: string, lastRatings: string[] }[]>([]);
  // Key to force refresh of table data after rating
  const [tableRefreshKey, setTableRefreshKey] = useState(0);
  
  // Hierarchical path (breadcrumb) for current card
  const [currentPath, setCurrentPath] = useState<{ id: string; text: string }[]>([]);
  
  // Predicted intervals for answer buttons
  const [predictedIntervals, setPredictedIntervals] = useState<{
    again: string;
    hard: string;
    good: string;
    easy: string;
  }>({ again: '', hard: '', good: '', easy: '' });

  const currentCardData = queueOrder[currentIndex];

  // Load cards data for table display
  useEffect(() => {
    async function loadCardsData() {
      const data: { id: string, text: string, nextDate: number, interval: string, lastRatings: string[] }[] = [];
      for (const item of queueOrder) {
        const text = await getRemText(plugin, item.rem);
        // Re-fetch card from database to get fresh repetitionHistory
        const freshCard = await plugin.card.findOne(item.card._id);
        const cardToUse = freshCard || item.card;
        const lastInterval = getLastInterval(cardToUse.repetitionHistory);
        const lastRatings = getLastRatingStr(cardToUse.repetitionHistory, 3);
        const interval = lastInterval ? formatMilliseconds(lastInterval.workingInterval) : '';
        data.push({
          id: item.rem._id,
          text,
          nextDate: lastInterval ? lastInterval.intervalSetOn + lastInterval.workingInterval : 0,
          interval,
          lastRatings
        });
      }
      setCardsData(data);
    }
    if (queueOrder.length > 0) {
      loadCardsData();
    }
  }, [queueOrder, plugin, tableRefreshKey]);

  // Sorting handlers
  const handleSort = (column: 'queue' | 'text' | 'nextDate' | 'interval' | 'lastRating') => {
    if (sortColumn === column) {
      setSortAscending(!sortAscending);
    } else {
      setSortColumn(column);
      setSortAscending(true);
    }
  };

  const ratingOrder: Record<string, number> = {
    'Easily recalled': 4,
    'Recalled with effort': 3,
    'Partially recalled': 2,
    'Forgot': 1,
    'Reset': 0,
    '': -1,
  };

  const getSortedCardsData = () => {
    // If sorting by queue order, return data in original order (or reversed)
    if (sortColumn === 'queue') {
      return sortAscending ? [...cardsData] : [...cardsData].reverse();
    }
    return [...cardsData].sort((a, b) => {
      let comparison = 0;
      switch (sortColumn) {
        case 'text':
          comparison = a.text.localeCompare(b.text, undefined, { numeric: true });
          break;
        case 'nextDate':
          comparison = a.nextDate - b.nextDate;
          break;
        case 'interval':
          comparison = a.interval.localeCompare(b.interval);
          break;
        case 'lastRating':
          const ratingA = ratingOrder[a.lastRatings[0]] ?? -1;
          const ratingB = ratingOrder[b.lastRatings[0]] ?? -1;
          comparison = ratingA - ratingB;
          break;
      }
      return sortAscending ? comparison : -comparison;
    });
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
    // Immediately clear previous content to avoid showing stale data
    setChildrenRems([]);
    setRegularChildren([]);
    setExtraDetailChildren([]);
    setQuestionText("");
    setAnswerTexts([]);
    setCurrentPath([]);
    setIsLoading(true);
    
    async function loadContent() {
      if (!currentCardData) {
        setIsLoading(false);
        return;
      }

      try {
        // Load question text
        const qText = await getRemText(plugin, currentCardData.rem);
        setQuestionText(qText);
        
        // Load hierarchical path
        const path = await getRemPath(plugin, currentCardData.rem);
        setCurrentPath(path);
        
        // Load children and their text
        const children = await currentCardData.rem.getChildrenRem();
        setChildrenRems(children);
        
        // Categorize children into regular and extra card detail
        const regular: Rem[] = [];
        const extraDetail: Rem[] = [];
        for (const child of children) {
          const hasExtraCardDetail = await child.hasPowerup(BuiltInPowerupCodes.ExtraCardDetail);
          if (hasExtraCardDetail) {
            extraDetail.push(child);
          } else {
            regular.push(child);
          }
        }
        setRegularChildren(regular);
        setExtraDetailChildren(extraDetail);
        
        // Load answer texts
        const texts = await Promise.all(
          children.map(child => getRemText(plugin, child))
        );
        setAnswerTexts(texts);
      } catch (error) {
        console.error("[MyRemNoteQueue] Error loading content:", error);
        setChildrenRems([]);
        setRegularChildren([]);
        setExtraDetailChildren([]);
        setQuestionText("");
        setAnswerTexts([]);
      }
      setIsLoading(false);
    }

    loadContent();
    setAnswerState("question");
  }, [currentIndex, currentCardData?.rem._id, renderKey, plugin]);

  const handleShowAnswer = () => {
    setAnswerState("answer");
  };

  const handleAnswer = async (score: QueueInteractionScore) => {
    if (currentCardData?.card) {
      try {
        await currentCardData.card.updateCardRepetitionStatus(score);
        // Trigger refresh of table data to show new rating
        setTableRefreshKey(prev => prev + 1);
        // Notify parent to refresh display data (for table)
        if (onCardRated) {
          onCardRated();
        }
      } catch (error) {
        console.error("Error updating card status:", error);
      }
    }
    goToNextCard();
  };

  const goToNextCard = useCallback(() => {
    if (currentIndex < queueOrder.length - 1) {
      const newIndex = currentIndex + 1;
      setCurrentIndex(newIndex);
      setRenderKey(prev => prev + 1);
      setAnswerState("question");
      // Notify parent of index change
      if (onCurrentIndexChange) {
        onCurrentIndexChange(newIndex);
      }
    } else {
      // Queue complete
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
      // Notify parent of queue order change so it can persist to storage
      if (onQueueOrderChange) {
        onQueueOrderChange(newQueue);
      }
      // Increment render key to force RemViewer to fully re-render
      setRenderKey(prev => prev + 1);
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
                const queuePosition = cardsData.findIndex(card => card.id === c.id);
                const isCurrentCard = queuePosition === currentIndex;
                const highlightStyle: React.CSSProperties = isCurrentCard 
                  ? { border: "1px solid #ddd", padding: 8, textAlign: "center", backgroundColor: "var(--highlight-color, rgba(74, 144, 217, 0.3))" } 
                  : { border: "1px solid #ddd", padding: 8, textAlign: "center" };
                return (
                <tr key={c.id}>
                  <td style={highlightStyle}>
                    {queuePosition + 1}
                  </td>
                  <td style={{ border: "1px solid #ddd", padding: 8 }}>
                    <MyRemNoteButtonSmall text={c.text} onClick={async () => { openRem(c.id); }} />
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
          <div style={breadcrumbContainerStyle}>
            {currentPath.slice(0, -1).map((item, index, arr) => (
              <span key={item.id} style={{ display: "flex", alignItems: "center" }}>
                {index > 0 && <span style={breadcrumbSeparatorStyle}>›</span>}
                <span 
                  style={breadcrumbItemStyle} 
                  onClick={() => openRem(item.id)}
                  title={`Open "${item.text}"`}
                >
                  {item.text}
                </span>
              </span>
            ))}
          </div>
        )}

        {/* Question (Front) - The Rem itself */}
        <div style={questionStyle}>
          <MyRemnoteRemViewer 
            remId={currentCardData.rem._id} 
            loadingText="(loading question...)"
            notFoundText="(question not found)"
          />
        </div>

        {/* Answer (Back) - Children Rems */}
        {answerState === "answer" && (
          <div style={answerStyle}>
            {childrenRems.length > 0 ? (
              <>
                {/* Regular answers (without Extra Card Detail powerup) */}
                {regularChildren.map((childRem) => (
                  <div key={`answer-${childRem._id}-${renderKey}`} style={childRemStyle}>
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
                  <div key={`extra-${childRem._id}-${renderKey}`} style={childRemStyle}>
                    <MyRemnoteRemViewer 
                      remId={childRem._id}
                      loadingText="(loading...)"
                      notFoundText="(not found)"
                    />
                  </div>
                ))}
              </>
            ) : (
              <div style={noContentStyle}>
                No answer content (no children found)
              </div>
            )}
          </div>
        )}
      </div>

      {/* Buttons */}
      {answerState === "question" ? (
        <button style={showAnswerButtonStyle} onClick={handleShowAnswer}>
          Show Answer
        </button>
      ) : (
        <div style={buttonContainerStyle}>
          <button style={skipButtonStyle} onClick={handleSkip}>
            Skip
          </button>
          <button
            style={{...forgetButtonStyle, display: 'flex', alignItems: 'center', gap: '6px'}}
            onClick={() => handleAnswer(QueueInteractionScore.AGAIN)}
          >
            <img src={scoreToImage.get("Forgot")} alt="Forgot" style={{ width: '20px', height: '20px' }} />
            {predictedIntervals.again}
          </button>
          <button
            style={{...partialButtonStyle, display: 'flex', alignItems: 'center', gap: '6px'}}
            onClick={() => handleAnswer(QueueInteractionScore.HARD)}
          >
            <img src={scoreToImage.get("Partially recalled")} alt="Partially Recalled" style={{ width: '20px', height: '20px' }} />
            {predictedIntervals.hard}
          </button>
          <button
            style={{...recalledButtonStyle, display: 'flex', alignItems: 'center', gap: '6px'}}
            onClick={() => handleAnswer(QueueInteractionScore.GOOD)}
          >
            <img src={scoreToImage.get("Recalled with effort")} alt="Recalled With Effort" style={{ width: '20px', height: '20px' }} />
            {predictedIntervals.good}
          </button>
          <button
            style={{...easyButtonStyle, display: 'flex', alignItems: 'center', gap: '6px'}}
            onClick={() => handleAnswer(QueueInteractionScore.EASY)}
          >
            <img src={scoreToImage.get("Easily recalled")} alt="Easily Recalled" style={{ width: '20px', height: '20px' }} />
            {predictedIntervals.easy}
          </button>
        </div>
      )}
    </div>
  );
}

export default MyRemNoteQueue;
