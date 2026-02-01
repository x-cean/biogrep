
/**
 * Buffer that accumulates chunks of string data and yields complete lines.
 * Useful for processing stdout streams that may split lines across chunks.
 */
export class LineBuffer {
    private buffer: string = "";

    /**
     * Appends a chunk and returns an array of complete lines found so far.
     * The last incomplete line is kept in the buffer.
     */
    append(chunk: string): string[] {
        this.buffer += chunk;
        const lines = this.buffer.split("\n");

        // The last element is either an empty string (if buffer ended with \n)
        // or an incomplete line. We keep it in the buffer.
        this.buffer = lines.pop() || "";

        return lines;
    }

    /**
     * Flushes any remaining data in the buffer as a final line.
     */
    flush(): string[] {
        if (this.buffer) {
            const line = this.buffer;
            this.buffer = "";
            return [line];
        }
        return [];
    }
}

/**
 * Accumulates items and triggers a callback periodically or when
 * a size threshold is reached. Useful for batching UI updates.
 */
export class ThrottledAccumulator<T> {
    private buffer: T[] = [];
    private timeoutId: ReturnType<typeof setTimeout> | null = null;
    private readonly callback: (items: T[]) => void;
    private readonly delay: number;
    private readonly maxBatchSize: number;

    constructor(
        callback: (items: T[]) => void,
        delay = 100,
        maxBatchSize = 100
    ) {
        this.callback = callback;
        this.delay = delay;
        this.maxBatchSize = maxBatchSize;
    }

    /**
     * Add an item to the accumulator.
     */
    add(item: T) {
        this.buffer.push(item);

        if (this.buffer.length >= this.maxBatchSize) {
            this.flush();
        } else if (!this.timeoutId) {
            this.timeoutId = setTimeout(() => this.flush(), this.delay);
        }
    }

    /**
     * Add multiple items to the accumulator.
     */
    addBatch(items: T[]) {
        this.buffer.push(...items);

        if (this.buffer.length >= this.maxBatchSize) {
            this.flush();
        } else if (!this.timeoutId) {
            this.timeoutId = setTimeout(() => this.flush(), this.delay);
        }
    }

    /**
     * Immediately process any buffered items.
     */
    flush() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }

        if (this.buffer.length > 0) {
            // Create a copy to send to callback
            const items = [...this.buffer];
            this.buffer = [];
            this.callback(items);
        }
    }
}
