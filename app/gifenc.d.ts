declare module "gifenc" {
  type Palette = number[][];
  type FrameOptions = { palette: Palette; delay?: number; repeat?: number; transparent?: boolean; transparentIndex?: number; dispose?: number };
  type Encoder = { writeFrame(index: Uint8Array, width: number, height: number, options: FrameOptions): void; finish(): void; bytes(): Uint8Array };
  export function GIFEncoder(options?: { initialCapacity?: number; auto?: boolean }): Encoder;
  export function quantize(data: Uint8Array | Uint8ClampedArray, maxColors: number, options?: Record<string, unknown>): Palette;
  export function applyPalette(data: Uint8Array | Uint8ClampedArray, palette: Palette, format?: string): Uint8Array;
}
