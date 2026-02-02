import { useState, useCallback, useRef, useEffect } from "react";

/**
 * useColumnResize Hook - Drag-to-resize column management
 * 
 * Manages the width state of a resizable column. Handles mouse events
 * for drag-to-resize functionality across the entire document.
 * 
 * @param defaultWidth - Initial column width in pixels
 * @param minWidth - Minimum allowed width (default: 80px)
 * @param maxWidth - Maximum allowed width (default: 400px)
 * @returns { width, handleMouseDown } - Current width and mouse handler for resize handle
 * 
 * @example
 * const { width, handleMouseDown } = useColumnResize(200, 100, 500);
 * // Use width for column style, handleMouseDown for resize handle
 */
export function useColumnResize(defaultWidth: number, minWidth = 80, maxWidth = 400) {
    const [width, setWidth] = useState(defaultWidth);
    const isResizing = useRef(false);
    const startX = useRef(0);
    const startWidth = useRef(0);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isResizing.current = true;
        startX.current = e.clientX;
        startWidth.current = width;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    }, [width]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing.current) return;
            const delta = e.clientX - startX.current;
            const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth.current + delta));
            setWidth(newWidth);
        };

        const handleMouseUp = () => {
            if (isResizing.current) {
                isResizing.current = false;
                document.body.style.cursor = "";
                document.body.style.userSelect = "";
            }
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);

        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
    }, [minWidth, maxWidth]);

    return { width, handleMouseDown };
}
