/**
 * Efficient Min-Heap implementation for Top-K selection.
 * Complexity: O(N log K) to find top K elements in a stream of N.
 */
export class TopKHeap<T> {
  private heap: { score: number; item: T }[] = [];

  constructor(private readonly k: number) {}

  add(score: number, item: T) {
    if (this.heap.length < this.k) {
      this.heap.push({ score, item });
      this.bubbleUp(this.heap.length - 1);
    } else if (score > this.heap[0]!.score) {
      this.heap[0] = { score, item };
      this.bubbleDown(0);
    }
  }

  getResults(): { score: number; item: T }[] {
    return [...this.heap].sort((a, b) => b.score - a.score);
  }

  private bubbleUp(index: number) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.heap[index]!.score >= this.heap[parent]!.score) break;
      [this.heap[index], this.heap[parent]] = [this.heap[parent]!, this.heap[index]!];
      index = parent;
    }
  }

  private bubbleDown(index: number) {
    const length = this.heap.length;
    while (true) {
      let smallest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;

      if (left < length && this.heap[left]!.score < this.heap[smallest]!.score) smallest = left;
      if (right < length && this.heap[right]!.score < this.heap[smallest]!.score) smallest = right;

      if (smallest === index) break;
      [this.heap[index], this.heap[smallest]] = [this.heap[smallest]!, this.heap[index]!];
      index = smallest;
    }
  }
}
