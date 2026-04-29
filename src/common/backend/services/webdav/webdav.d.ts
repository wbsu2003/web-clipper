// Type definitions for webdav@1.5.5
// This file provides TypeScript types for the webdav client library

declare module 'webdav' {
  export interface FileStat {
    filename: string;
    basename: string;
    lastmod: string;
    size: number;
    type: 'file' | 'directory';
    mime?: string;
    etag?: string;
    displayname?: string;
    props?: any;
  }

  export interface WebDAVClient {
    copyFile(remotePath: string, targetRemotePath: string, options?: any): Promise<void>;
    createDirectory(remotePath: string, options?: any): Promise<void>;
    createReadStream(remotePath: string, options?: any): NodeJS.ReadableStream;
    createWriteStream(remotePath: string, options?: any): NodeJS.WritableStream;
    deleteFile(remotePath: string, options?: any): Promise<void>;
    getDirectoryContents(remotePath: string, options?: any): Promise<FileStat[] | { response: any }>;
    getFileContents(remotePath: string, options?: any): Promise<NodeJS.ReadableStream | Buffer>;
    getFileDownloadLink(remotePath: string): string;
    getFileUploadLink(remotePath: string): string;
    getQuota(options?: any): Promise<{ used: number; available: number } | null>;
    lock(remotePath: string, options?: any): Promise<{ token: string; serverTimeout: string }>;
    moveFile(remotePath: string, targetRemotePath: string, options?: any): Promise<void>;
    putFileContents(remotePath: string, data: string | Buffer | Blob, options?: any): Promise<void>;
    stat(remotePath: string, options?: any): Promise<FileStat>;
    unlock(remotePath: string, options?: any): Promise<void>;
  }

  export interface WebDAVServiceConfig {
    origin: string;
    username: string;
    password: string;
    remotePath?: string;
    remoteBasePath?: string;
  }

  export function createClient(
    remoteURL: string,
    options?: { username?: string; password?: string; token?: string; httpAgent?: any; httpsAgent?: any }
  ): WebDAVClient;

  export default createClient;
}
