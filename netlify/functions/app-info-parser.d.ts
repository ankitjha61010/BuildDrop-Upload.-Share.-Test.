declare module 'app-info-parser' {
  export default class AppInfoParser {
    constructor(file: string | Blob | File);
    parse(): Promise<Record<string, any>>;
  }
}
