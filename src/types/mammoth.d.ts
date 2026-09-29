// Minimal typings for mammoth (the package ships none). We only use the
// browser-safe raw-text extractor; the bundler swaps mammoth's Node unzip
// for its browser build via the package's "browser" field map.
declare module "mammoth" {
  export interface MammothMessage {
    type: string;
    message?: string;
  }
  export interface ExtractRawTextResult {
    value: string;
    messages: MammothMessage[];
  }
  export function extractRawText(input: {
    arrayBuffer: ArrayBuffer;
  }): Promise<ExtractRawTextResult>;
  const mammoth: {
    extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<ExtractRawTextResult>;
  };
  export default mammoth;
}
