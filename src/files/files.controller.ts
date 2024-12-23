import { Controller, Post, Body, Get } from '@nestjs/common';
import { FilesService } from './files.service';
import {
  IDownloadFilesData,
  IDownloadFilesResponse,
  IGetFilesResponse,
} from './files.interfaces';

@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post()
  async downloadFiles(
    @Body() downloadFilesData: IDownloadFilesData,
  ): Promise<IDownloadFilesResponse> {
    return this.filesService.downloadFiles(downloadFilesData);
  }

  @Get()
  async getFiles(): Promise<IGetFilesResponse> {
    return this.filesService.getFiles();
  }
}
