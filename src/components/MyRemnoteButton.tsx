import React from 'react';
import { MyRemnoteRemViewer } from './MyRemnoteRemViewer';

interface MyRemNoteButtonProps {
  img?: string; // SVG path string
  text: string; // Button label
  onClick: () => void; // Click handler
  active?: boolean;
  style?: React.CSSProperties;
}

const MyRemNoteButton: React.FC<MyRemNoteButtonProps> = ({ img, text, onClick, active = true, style }) => {
  return (
    <button
      className={`py-1.5 px-3 h-8 rn-clr-background-primary inline-flex items-center rounded-md border-0 ${
        active
          ? 'hover:bg-gray-5 text-gray-100'
          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
      }`}
      onClick={active ? onClick : undefined}
      style={style}
    >
      {img && (
        <div style={{ display: 'flex', alignItems: 'center', paddingRight: '8px' }}>
          <svg
            viewBox="0 0 24 24" // Updated to match the provided SVG
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: '16px', minWidth: '16px', height: '16px', minHeight: '16px' }}
            fill="none" // Set to "none" for an outline icon
          >
            <path
              d={img}
              stroke="currentColor" // Use stroke instead of fill
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        </div>
      )}
      <span className="text-black">{text}</span>
    </button>
  );
};

export const MyRemNoteButtonSmall: React.FC<MyRemNoteButtonProps> = ({ img, text, onClick, active = true }) => {
  return (
    <button
      className={`py-1 px-2 h-6 rn-clr-background-primary inline-flex items-center rounded-md border-0 ${
        active
          ? 'hover:bg-gray-5 text-gray-100'
          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
      }`}
      onClick={active ? onClick : undefined}
    >
      {img && (
        <div style={{ display: 'flex', alignItems: 'center', paddingRight: '6px' }}>
          <svg
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            style={{ width: '12px', minWidth: '12px', height: '12px', minHeight: '12px' }}
            fill="none"
          >
            <path
              d={img}
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        </div>
      )}
      <span className="text-black" style={{ fontSize: '12px' }}>{text}</span>
    </button>
  );
};

export default MyRemNoteButton;

interface MyRemNoteButtonSmallByIdProps {
  /** The ID of the rem whose content to display as the button label */
  remId: string;
  onClick: () => void;
  active?: boolean;
  /** Cloze rendering mode passed to MyRemnoteRemViewer (default: 'answer') */
  clozeMode?: 'question' | 'answer' | 'none';
}

export const MyRemNoteButtonSmallById: React.FC<MyRemNoteButtonSmallByIdProps> = ({
  remId,
  onClick,
  active = true,
  clozeMode = 'answer',
}) => {
  return (
    <button
      className={`py-1 px-2 rn-clr-background-primary inline-flex items-center rounded-md border-0 ${
        active
          ? 'hover:bg-gray-5 text-gray-100'
          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
      }`}
      onClick={active ? onClick : undefined}
      style={{ height: 'auto', minHeight: '24px', textAlign: 'left' }}
    >
      <MyRemnoteRemViewer
        remId={remId}
        showChildren={false}
        showBullet={false}
        clozeMode={clozeMode}
        loadingText="..."
        notFoundText="(not found)"
        style={{ fontSize: '12px' }}
      />
    </button>
  );
};