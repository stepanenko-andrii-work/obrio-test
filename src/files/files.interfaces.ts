import { File } from './entities/file.entity';

export interface IDownloadFilesData {
  urls: string[];
}

export interface IDownloadFilesResponse {
  succeeded: string[];
  failed: string[];
}

export interface IGetFilesResponse {
  data: File[];
}

export interface IGoogleDriveUrlWithFileName {
  url: string;
  fileName: string;
}
