export class SparseSet<T> {
  private readonly sparse: number[] = [];
  private readonly denseIndices: number[] = [];
  private readonly denseValues: T[] = [];

  get size(): number {
    return this.denseIndices.length;
  }

  has(index: number): boolean {
    const densePosition = this.sparse[index];
    return densePosition !== undefined && this.denseIndices[densePosition] === index;
  }

  get(index: number): T | undefined {
    const densePosition = this.sparse[index];
    if (densePosition === undefined || this.denseIndices[densePosition] !== index) return undefined;
    return this.denseValues[densePosition];
  }

  set(index: number, value: T): void {
    const densePosition = this.sparse[index];
    if (densePosition !== undefined && this.denseIndices[densePosition] === index) {
      this.denseValues[densePosition] = value;
      return;
    }
    this.sparse[index] = this.denseIndices.length;
    this.denseIndices.push(index);
    this.denseValues.push(value);
  }

  delete(index: number): boolean {
    const densePosition = this.sparse[index];
    if (densePosition === undefined || this.denseIndices[densePosition] !== index) return false;

    const lastPosition = this.denseIndices.length - 1;
    const lastIndex = this.denseIndices[lastPosition];
    const lastValue = this.denseValues[lastPosition];
    if (densePosition !== lastPosition && lastIndex !== undefined && lastValue !== undefined) {
      this.denseIndices[densePosition] = lastIndex;
      this.denseValues[densePosition] = lastValue;
      this.sparse[lastIndex] = densePosition;
    }
    this.denseIndices.pop();
    this.denseValues.pop();
    delete this.sparse[index];
    return true;
  }

  indices(): readonly number[] {
    return this.denseIndices;
  }
}
