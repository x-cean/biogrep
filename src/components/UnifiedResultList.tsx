import { ReactNode } from "react";
import { Virtuoso } from "react-virtuoso";
import { useColumnResize } from "../hooks/useColumnResize";
import { CONFIG } from "../config";

interface UnifiedResultListProps<T> {
    data: T[];
    initialColumnWidth: number;
    /**
     * Render the content of the primary (resizable) column.
     * Use this for the clickable filename or path.
     */
    renderPrimaryColumn: (item: T) => ReactNode;
    /**
     * Render the content that appears after the resize handle.
     * Use this for line numbers, previews, or secondary paths.
     */
    renderSecondaryContent: (item: T) => ReactNode;
    /**
     * Action to perform when the primary column is clicked.
     */
    onPrimaryClick: (item: T) => void;
    /**
     * Optional key generator for Virtuoso
     */
    computeItemKey?: (index: number, item: T) => string;
}

export function UnifiedResultList<T>({
    data,
    initialColumnWidth,
    renderPrimaryColumn,
    renderSecondaryContent,
    onPrimaryClick,
}: UnifiedResultListProps<T>) {
    const { width, handleMouseDown } = useColumnResize(
        initialColumnWidth,
        CONFIG.UI.COLUMN_WIDTHS.FILENAME_MIN,
        CONFIG.UI.COLUMN_WIDTHS.FILENAME_MAX
    );

    return (
        <Virtuoso
            style={{ height: "100%" }}
            data={data}
            itemContent={(_index, item) => (
                <div className="flex hover:bg-gray-800 px-2 py-1 rounded group">
                    <span
                        onClick={() => onPrimaryClick(item)}
                        className="truncate hover:underline shrink-0 cursor-pointer"
                        style={{ width }}
                    >
                        {renderPrimaryColumn(item)}
                    </span>

                    {/* Resize Handle */}
                    <div
                        className="w-px mx-1 bg-gray-600 hover:bg-blue-400 hover:w-1 cursor-col-resize shrink-0 transition-all opacity-50 group-hover:opacity-100"
                        onMouseDown={handleMouseDown}
                        onClick={(e) => e.stopPropagation()}
                    />

                    {/* Secondary Content (Remaining Width) */}
                    <div className="flex-1 min-w-0 flex items-center">
                        {renderSecondaryContent(item)}
                    </div>
                </div>
            )}
        />
    );
}
