import { useState, useCallback, useRef, useEffect } from "react";

/**
 * Hook to manage resizable column widths with mouse drag.
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
