import { usePlugin, Rem, RNPlugin, RichTextInterface } from "@remnote/plugin-sdk";
import { useState, useEffect, ReactNode } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

interface MyRemnoteRemViewerProps {
  /** The ID of the rem to display */
  remId: string;
  /** Optional custom styling */
  style?: React.CSSProperties;
  /** Optional className for additional styling */
  className?: string;
  /** Placeholder text while loading */
  loadingText?: string;
  /** Text to show when rem is not found */
  notFoundText?: string;
}

/**
 * Fallback map of color indices to CSS colors.
 * Used only when the color value is a number (index into RemNote's palette).
 * Based on RemColor enum: Red=1, Orange=2, Yellow=3, Green=4, Blue=5, Purple=6, Brown=8, Pink=9
 */
const fallbackColors: Record<number, string> = {
  1: "#ff6b6b",   // Red
  2: "#ffa94d",   // Orange
  3: "#ffd43b",   // Yellow
  4: "#69db7c",   // Green
  5: "#4dabf7",   // Blue
  6: "#da77f2",   // Purple
  7: "#74c0fc",   // Cyan (if used)
  8: "#a1887f",   // Brown
  9: "#f48fb1",   // Pink
};

/**
 * Resolves a color value from RemNote's rich text formatting.
 * - If it's a string starting with '#', use it directly as a hex color
 * - If it's a number, look it up in the fallback color palette
 * - If it's a numeric string, parse it and look it up
 * @returns The CSS color string or undefined if not resolvable
 */
function resolveColor(value: number | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  
  if (typeof value === "string") {
    // If it's already a hex color, use it directly
    if (value.startsWith("#")) {
      return value;
    }
    // If it's an rgb/rgba value, use it directly
    if (value.startsWith("rgb")) {
      return value;
    }
    // Try parsing as a number (index)
    const parsed = parseInt(value, 10);
    if (!isNaN(parsed) && fallbackColors[parsed]) {
      return fallbackColors[parsed];
    }
    // It might be a named color or other valid CSS color
    return value;
  }
  
  if (typeof value === "number" && fallbackColors[value]) {
    return fallbackColors[value];
  }
  
  return undefined;
}

/**
 * Get plain text from a Rem (used internally for reference names).
 */
async function getRemPlainText(plugin: RNPlugin, rem: Rem | undefined): Promise<string> {
  if (!rem) return "";
  const richText = rem.text;
  if (!richText) return "";

  const textParts = await Promise.all(
    richText.map(async (item) => {
      if (typeof item === "string") {
        return item;
      }
      switch (item.i) {
        case "m":
        case "x":
        case "n":
          return item.text || "";
        case "q":
          const referencedRem = await plugin.rem.findOne(item._id);
          if (referencedRem) {
            return await getRemPlainText(plugin, referencedRem);
          } else if (item.textOfDeletedRem) {
            return await getPlainTextFromRichText(plugin, item.textOfDeletedRem);
          }
          return "";
        case "i":
          return "[image]";
        default:
          return "";
      }
    })
  );

  return textParts.join("");
}

/**
 * Get plain text from RichTextInterface.
 */
async function getPlainTextFromRichText(plugin: RNPlugin, richText: RichTextInterface): Promise<string> {
  const textParts = await Promise.all(
    richText.map(async (item) => {
      if (typeof item === "string") {
        return item;
      }
      switch (item.i) {
        case "m":
        case "x":
        case "n":
          return item.text || "";
        case "q":
          const referencedRem = await plugin.rem.findOne(item._id);
          if (referencedRem) {
            return await getRemPlainText(plugin, referencedRem);
          } else if (item.textOfDeletedRem) {
            return await getPlainTextFromRichText(plugin, item.textOfDeletedRem);
          }
          return "";
        default:
          return "";
      }
    })
  );
  return textParts.join("");
}

/**
 * Process RichTextInterface and return React elements for rendering.
 * Handles different element types:
 * - q: Reference to another rem (underlined, colored)
 * - m: Formatted text (bold, italic, highlight, etc.)
 * - i: Image
 * - x: Plain text
 */
async function processRichTextToElements(
  plugin: RNPlugin,
  richText: RichTextInterface
): Promise<ReactNode[]> {
  const elements: ReactNode[] = [];

  // Debug: log the entire richText array
  console.log("[MyRemnoteRemViewer] Processing richText:", JSON.stringify(richText, null, 2));

  for (let idx = 0; idx < richText.length; idx++) {
    const item = richText[idx];

    // Debug: log each item with its type
    console.log(`[MyRemnoteRemViewer] Item ${idx}:`, typeof item === "string" ? `string: "${item}"` : `i="${item.i}"`, item);

    if (typeof item === "string") {
      elements.push(<span key={idx}>{item}</span>);
      continue;
    }

    switch (item.i) {
      case "q": {
        // Reference to another rem - get the name, underline and color it
        const referencedRem = await plugin.rem.findOne(item._id);
        let refText = "";
        if (referencedRem) {
          refText = await getRemPlainText(plugin, referencedRem);
        } else if (item.textOfDeletedRem) {
          refText = await getPlainTextFromRichText(plugin, item.textOfDeletedRem);
        }
        elements.push(
          <span
            key={idx}
            style={{
              textDecoration: "underline",
              color: "#4dabf7", // Light blue for references
              cursor: "pointer",
            }}
            title={`Reference: ${refText}`}
          >
            {refText || "(deleted reference)"}
          </span>
        );
        break;
      }

      case "m": {
        // Formatted text - apply formatting based on flags
        const text = item.text || "";
        const style: React.CSSProperties = {};
        const itemAny = item as any;

        // Bold
        if (item.b) {
          style.fontWeight = "bold";
        }

        // Italic
        if (item.u) {
          style.fontStyle = "italic";
        }

        // Strikethrough - check if property exists
        if ("s" in item && item.s) {
          style.textDecoration = "line-through";
        }

        // Underline
        if (item.l) {
          style.textDecoration = style.textDecoration
            ? `${style.textDecoration} underline`
            : "underline";
        }

        // Highlight/background color - 'h' field
        if (item.h !== undefined) {
          const bgColor = resolveColor(item.h);
          if (bgColor) {
            style.backgroundColor = bgColor;
            style.padding = "0 2px";
            style.borderRadius = "2px";
          }
        }

        // Text color - 'tc' field
        if (itemAny.tc !== undefined) {
          const textColor = resolveColor(itemAny.tc);
          if (textColor) {
            style.color = textColor;
          }
        }

        // Code formatting
        if (item.code) {
          style.fontFamily = "monospace";
          style.backgroundColor = "#2d2d2d";
          style.padding = "1px 4px";
          style.borderRadius = "3px";
          style.fontSize = "0.9em";
        }

        // Check if this is a link (has 'url' field)
        const linkUrl = itemAny.url;
        if (linkUrl) {
          // Render as a clickable link
          style.color = style.color || "#4dabf7";
          style.textDecoration = "underline";
          style.cursor = "pointer";
          
          elements.push(
            <a
              key={idx}
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={style}
              title={linkUrl}
            >
              {text || linkUrl}
            </a>
          );
        } else {
          elements.push(
            <span key={idx} style={style}>
              {text}
            </span>
          );
        }
        break;
      }

      case "i": {
        // Image - display with appropriate size
        const imageItem = item as any; // Cast to access all properties
        let imageUrl = imageItem.url || "";
        
        // Debug: log the image item to see what we're working with
        console.log("[MyRemnoteRemViewer] Image item:", imageItem);
        
        // Handle RemNote's %LOCAL_FILE% placeholder for locally stored images
        if (imageUrl.startsWith("%LOCAL_FILE%")) {
          // Extract the file identifier after the placeholder
          const fileId = imageUrl.replace("%LOCAL_FILE%", "");
          // RemNote stores files on AWS S3
          imageUrl = `https://remnote-user-data.s3.amazonaws.com/${fileId}`;
        }
        
        // If the URL is relative or uses a special scheme, it might need adjustment
        // RemNote stores images with various URL formats
        if (imageUrl) {
          // Handle potential edge cases with URL encoding
          if (imageUrl.startsWith("data:")) {
            // Data URLs work directly
          } else if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
            // Absolute URLs work directly
          } else if (imageUrl.startsWith("/")) {
            // Relative URLs might need the RemNote base URL
            // For now, try using it as-is
          }
          
          // Use width/height from the item if available
          const imgStyle: React.CSSProperties = {
            maxWidth: "100%",
            maxHeight: "300px",
            objectFit: "contain" as const,
            display: "inline-block",
            verticalAlign: "middle",
            margin: "4px 0",
            borderRadius: "4px",
          };
          
          // If the image has specified dimensions, use them (respecting max constraints)
          if (imageItem.width && imageItem.height) {
            const aspectRatio = imageItem.width / imageItem.height;
            const maxWidth = Math.min(imageItem.width, 600);
            imgStyle.width = maxWidth;
            imgStyle.height = maxWidth / aspectRatio;
          }
          
          elements.push(
            <img
              key={idx}
              src={imageUrl}
              alt={imageItem.title || "Embedded image"}
              style={imgStyle}
              onError={(e) => {
                // Handle broken images - show placeholder instead of hiding
                console.error("[MyRemnoteRemViewer] Image failed to load:", imageUrl);
                const img = e.target as HTMLImageElement;
                img.style.border = "1px dashed #888";
                img.style.padding = "8px";
                img.alt = `[Image: ${imageItem.title || imageUrl.substring(0, 50)}...]`;
              }}
            />
          );
        } else if (imageItem.imgId) {
          // If there's an imgId but no URL, show a placeholder
          console.log("[MyRemnoteRemViewer] Image has imgId but no URL:", imageItem.imgId);
          elements.push(
            <span key={idx} style={{ color: "#888", fontStyle: "italic" }}>
              [Image: {imageItem.imgId}]
            </span>
          );
        }
        break;
      }

      case "x": {
        // LaTeX - render using KaTeX
        const latexCode = item.text || "";
        const isBlock = item.block === true;
        
        try {
          const html = katex.renderToString(latexCode, {
            throwOnError: false,
            displayMode: isBlock,
            output: "html",
          });
          
          elements.push(
            <span
              key={idx}
              dangerouslySetInnerHTML={{ __html: html }}
              style={{
                display: isBlock ? "block" : "inline",
                textAlign: isBlock ? "center" : undefined,
                margin: isBlock ? "8px 0" : undefined,
              }}
            />
          );
        } catch (err) {
          // Fallback to raw text if KaTeX fails
          console.error("[MyRemnoteRemViewer] KaTeX error:", err);
          elements.push(
            <span key={idx} style={{ fontFamily: "monospace", color: "#e74c3c" }}>
              {latexCode}
            </span>
          );
        }
        break;
      }

      case "n": {
        // Annotation text
        const text = item.text || "";
        elements.push(<span key={idx}>{text}</span>);
        break;
      }

      default: {
        // Handle undocumented types
        const itemAny = item as any;
        
        // URL/Link element (i="u")
        if (itemAny.i === "u") {
          const url = itemAny.url || "";
          const title = itemAny.title || url;
          
          elements.push(
            <a
              key={idx}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "#4dabf7",
                textDecoration: "underline",
                cursor: "pointer",
              }}
              title={url}
            >
              {title}
            </a>
          );
          break;
        }
        
        // For other unknown types, try to extract text if available
        if ("text" in item && typeof item.text === "string") {
          elements.push(<span key={idx}>{item.text}</span>);
        }
        break;
      }
    }
  }

  return elements;
}

/**
 * A custom RemViewer component that displays a Rem with rich text support.
 * Handles formatted text, references, images, and more.
 */
export function MyRemnoteRemViewer({
  remId,
  style,
  className,
  loadingText = "Loading...",
  notFoundText = "(Rem not found)",
}: MyRemnoteRemViewerProps) {
  const plugin = usePlugin();
  const [content, setContent] = useState<ReactNode[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    async function loadRemContent() {
      setIsLoading(true);
      setError(false);

      try {
        const rem = await plugin.rem.findOne(remId);

        if (!isMounted) return;

        if (!rem) {
          setError(true);
          setContent([]);
        } else {
          const richText = rem.text;
          if (richText && richText.length > 0) {
            const elements = await processRichTextToElements(plugin, richText);
            if (isMounted) {
              setContent(elements);
            }
          } else {
            if (isMounted) {
              setContent([]);
            }
          }
        }
      } catch (err) {
        console.error("[MyRemnoteRemViewer] Error loading rem:", err);
        if (isMounted) {
          setError(true);
          setContent([]);
        }
      }

      if (isMounted) {
        setIsLoading(false);
      }
    }

    if (remId) {
      loadRemContent();
    } else {
      setIsLoading(false);
      setError(true);
    }

    return () => {
      isMounted = false;
    };
  }, [remId, plugin]);

  const baseStyle: React.CSSProperties = {
    ...style,
  };

  if (isLoading) {
    return (
      <span style={{ ...baseStyle, opacity: 0.5, fontStyle: "italic" }} className={className}>
        {loadingText}
      </span>
    );
  }

  if (error) {
    return (
      <span style={{ ...baseStyle, opacity: 0.5, fontStyle: "italic" }} className={className}>
        {notFoundText}
      </span>
    );
  }

  return (
    <span style={baseStyle} className={className}>
      • {content.length > 0 ? content : "(empty)"}
    </span>
  );
}

export default MyRemnoteRemViewer;
