export const OUT: string;
export const WIDTH: number;
export const HEIGHT: number;
/** Returns the PNG unchanged when every pixel is gray; otherwise an RGB PNG with each coloured pixel turned to the gray of its luminance. */
export function grayOnly(png: Buffer): Buffer;
export function render(): Promise<Buffer>;
