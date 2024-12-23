import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';
import {
  IDownloadFilesData,
  IDownloadFilesResponse,
  IGetFilesResponse,
  IGoogleDriveUrlWithFileName,
} from './files.interfaces';
import { File } from './entities/file.entity';
import { google } from 'googleapis';

@Injectable()
export class FilesService {
  private uploadDir = path.join(__dirname, '..', 'uploads');
  private maxRetries = 3;
  private drive;

  constructor(
    @InjectRepository(File)
    private readonly filesRepository: Repository<File>,
  ) {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }

    const auth = new google.auth.GoogleAuth({
      keyFile: 'google-api-credentials.json',
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    this.drive = google.drive({ version: 'v3', auth });
  }

  async downloadFiles(
    downloadFilesData: IDownloadFilesData,
  ): Promise<IDownloadFilesResponse> {
    const { urls } = downloadFilesData;

    const results = await Promise.allSettled(
      urls.map((url, index) => this.downloadFile(url, `file_${index}`)),
    );

    const failedUrls = results
      .filter((result) => result.status === 'rejected')
      .map((_result, index) => urls[index]);

    const retryResults = await this.retryFailedDownloads(failedUrls);

    const succeeded = [
      ...results
        .filter((result) => result.status === 'fulfilled')
        .map((result: PromiseFulfilledResult<string>) => result.value),
      ...retryResults.succeeded,
    ];

    const googleDriveUrlsWithFileNames =
      await this.uploadToGoogleDrive(succeeded);

    await this.uploadFileUrls(googleDriveUrlsWithFileNames);

    const failed = retryResults.failed;

    return { succeeded, failed };
  }

  async getFiles(): Promise<IGetFilesResponse> {
    const files = await this.filesRepository.find();

    return { data: files };
  }

  private async downloadFile(url: string, fileName: string): Promise<string> {
    const filePath = path.join(this.uploadDir, fileName);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download ${url}: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error(`Failed to read stream from ${url}`);
    }

    const fileStream = fs.createWriteStream(filePath);
    const writer = fileStream;

    const pump = () => {
      reader
        .read()
        .then(({ done, value }) => {
          if (done) {
            writer.end();
            return;
          }

          writer.write(value);
          pump();
        })
        .catch((err) => {
          fs.unlink(filePath, (err) => {
            if (err) throw err;
          });

          throw new Error(`Error while downloading file: ${err.message}`);
        });
    };

    pump();

    return new Promise((resolve, reject) => {
      fileStream.on('finish', () => resolve(filePath));
      fileStream.on('error', (err) => reject(err));
    });
  }

  private async retryFailedDownloads(
    failedUrls: string[],
  ): Promise<IDownloadFilesResponse> {
    let attempts = 0;
    const succeeded: string[] = [];
    const failed = [...failedUrls];

    while (attempts < this.maxRetries && failed.length > 0) {
      attempts += 1;
      console.log(`Retry attempt ${attempts} for ${failed.length} files...`);

      const results = await Promise.allSettled(
        failed.map((url) => {
          const fileName = `retry_${path.basename(url)}_attempt_${attempts}`;
          return this.downloadFile(url, fileName);
        }),
      );

      succeeded.push(
        ...results
          .filter((result) => result.status === 'fulfilled')
          .map((result: PromiseFulfilledResult<string>) => result.value),
      );

      const stillFailed = results
        .map((result, index) =>
          result.status === 'rejected' ? failed[index] : null,
        )
        .filter((url) => url !== null);

      failed.length = 0;
      failed.push(...stillFailed);
    }

    return {
      succeeded,
      failed: failed.map(
        (url) => `${url} (failed after ${this.maxRetries} attempts)`,
      ),
    };
  }

  private async uploadFileUrls(
    googleDriveUrlsWithFileNames: IGoogleDriveUrlWithFileName[],
  ): Promise<File[]> {
    const files = googleDriveUrlsWithFileNames.map(
      (googleDriveUrlWithFileName) => {
        return this.filesRepository.create({
          url: googleDriveUrlWithFileName.url,
          name: googleDriveUrlWithFileName.fileName,
        });
      },
    );

    return this.filesRepository.save(files);
  }

  private extractFileName(url: string): string {
    try {
      return url.split('/').pop() || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private async uploadToGoogleDrive(
    urls: string[],
  ): Promise<IGoogleDriveUrlWithFileName[]> {
    const uploadTasks = urls.map(async (url) => {
      try {
        const fileName = this.extractFileName(url);

        const res = await this.drive.files.create({
          requestBody: {
            name: fileName,
            parents: [process.env.FOLDER_ID],
          },
          media: {
            mimeType: 'application/octet-stream',
            body: fs.createReadStream(url),
          },
          fields: 'id',
        });

        const fileId = res.data.id;

        await this.drive.permissions.create({
          fileId,
          requestBody: {
            role: 'reader',
            type: 'anyone',
          },
        });

        fs.unlink(url, (err) => {
          if (err) throw err;
        });

        return {
          url: `https://drive.google.com/file/d/${fileId}/view?usp=sharing`,
          fileName,
        };
      } catch (error) {
        console.error(`Failed to upload file at ${url}:`, error);
        return null;
      }
    });

    const results = await Promise.allSettled(uploadTasks);

    const filesUrls = results
      .filter(
        (result) => result.status === 'fulfilled' && result.value !== null,
      )
      .map(
        (result) =>
          (result as PromiseFulfilledResult<IGoogleDriveUrlWithFileName>).value,
      );

    return filesUrls;
  }
}
