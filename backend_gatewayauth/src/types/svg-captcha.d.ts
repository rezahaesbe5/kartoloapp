declare module 'svg-captcha' {
  export interface CaptchaOptions {
    size?: number;
    noise?: number;
    color?: boolean;
    background?: string;
    ignoreChars?: string;
    fontSize?: number;
    width?: number;
    height?: number;
    charPreset?: string;
  }
  export interface CaptchaObject {
    data: string;
    text: string;
  }
  function create(options?: CaptchaOptions): CaptchaObject;
  function createMathExpr(options?: CaptchaOptions): CaptchaObject;
  function loadFont(path: string): void;

  const svgCaptcha: {
    create: typeof create;
    createMathExpr: typeof createMathExpr;
    loadFont: typeof loadFont;
  };
  export default svgCaptcha;
}
