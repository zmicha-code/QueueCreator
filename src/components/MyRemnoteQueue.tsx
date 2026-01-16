import {
  usePlugin,
  Card,
  Rem,
  QueueInteractionScore,
} from "@remnote/plugin-sdk";
import { useState, useEffect, useCallback } from "react";
import { SearchData, getRemText } from "../widgets/customQueueWidget";

interface MyRemNoteQueueProps {
  /** Array of card data objects containing rem and card */
  cards: SearchData[];
  width?: string | number;
  maxWidth?: string | number;
  onQueueComplete?: () => void;
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

export function MyRemNoteQueue({
  cards,
  width = "100%",
  maxWidth = "100%",
  onQueueComplete,
}: MyRemNoteQueueProps) {
  const plugin = usePlugin();

  // Filter to only cards that have a valid card object and maintain local queue order
  const [queueOrder, setQueueOrder] = useState<{ rem: Rem; card: Card }[]>([]);
  
  // Initialize queue order when cards prop changes
  useEffect(() => {
    const enabledCards = cards.filter((c) => c.card !== null) as { rem: Rem; card: Card }[];
    setQueueOrder(enabledCards);
    setCurrentIndex(0);
  }, [cards]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerState, setAnswerState] = useState<AnswerState>("question");
  const [childrenRems, setChildrenRems] = useState<Rem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Render key to force complete re-render of RemViewer components
  const [renderKey, setRenderKey] = useState(0);
  // Plain text for testing (to debug RemViewer rendering issue)
  const [questionText, setQuestionText] = useState("");
  const [answerTexts, setAnswerTexts] = useState<string[]>([]);

  const currentCardData = queueOrder[currentIndex];

  // Load children when card changes
  useEffect(() => {
    // Immediately clear previous content to avoid showing stale data
    setChildrenRems([]);
    setQuestionText("");
    setAnswerTexts([]);
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
        
        // Load children and their text
        const children = await currentCardData.rem.getChildrenRem();
        setChildrenRems(children);
        
        // Load answer texts
        const texts = await Promise.all(
          children.map(child => getRemText(plugin, child))
        );
        setAnswerTexts(texts);
      } catch (error) {
        console.error("[MyRemNoteQueue] Error loading content:", error);
        setChildrenRems([]);
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
      } catch (error) {
        console.error("Error updating card status:", error);
      }
    }
    goToNextCard();
  };

  const goToNextCard = useCallback(() => {
    if (currentIndex < queueOrder.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setRenderKey(prev => prev + 1);
      setAnswerState("question");
    } else {
      // Queue complete
      if (onQueueComplete) {
        onQueueComplete();
      }
    }
  }, [currentIndex, queueOrder.length, onQueueComplete]);

  const handleSkip = () => {
    // Move current card to the back of the queue
    if (currentCardData && queueOrder.length > 1) {
      const newQueue = [...queueOrder];
      const [skippedCard] = newQueue.splice(currentIndex, 1);
      newQueue.push(skippedCard);
      setQueueOrder(newQueue);
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
      {/* Progress indicator */}
      <div style={progressStyle}>
        Card {currentIndex + 1} of {queueOrder.length}
      </div>

      {/* Card content */}
      <div style={cardContainerStyle}>
        {/* Question (Front) - The Rem itself (plain text for testing) */}
        <div style={questionStyle}>
          {questionText || "(loading question...)"}
        </div>

        {/* Answer (Back) - Children Rems (plain text for testing) */}
        {answerState === "answer" && (
          <div style={answerStyle}>
            {answerTexts.length > 0 ? (
              answerTexts.map((text, index) => (
                <div key={`answer-${index}-${renderKey}`} style={childRemStyle}>
                  {text || "(empty)"}
                </div>
              ))
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
            style={forgetButtonStyle}
            onClick={() => handleAnswer(QueueInteractionScore.AGAIN)}
          >
            Forget
          </button>
          <button
            style={partialButtonStyle}
            onClick={() => handleAnswer(QueueInteractionScore.HARD)}
          >
            Partially Recalled
          </button>
          <button
            style={recalledButtonStyle}
            onClick={() => handleAnswer(QueueInteractionScore.GOOD)}
          >
            Recalled With Effort
          </button>
          <button
            style={easyButtonStyle}
            onClick={() => handleAnswer(QueueInteractionScore.EASY)}
          >
            Easily Recalled
          </button>
        </div>
      )}
    </div>
  );
}

export default MyRemNoteQueue;
