import { Injectable, Logger } from '@nestjs/common';

import { Cron } from '@nestjs/schedule';
import { SERVER_URLS } from '../utils/constants';
import axios from 'axios';

@Injectable()
export class KeepAliveService {
  private readonly logger = new Logger(KeepAliveService.name);

  @Cron('*/1 * * * *') // Runs every 1 minute
  async pingExternalApis() {
    this.logger.log('Starting KeepAlive cron job...');

    for (const [key, url] of Object.entries(SERVER_URLS)) {
      if (!url) {
        this.logger.warn(`Skipping ${key}: URL is not defined`);
        continue;
      }

      try {
        const response = await axios.get(url);
        this.logger.log(`Pinged ${key} (${url}): ${response.status}`);
      } catch (error) {
        this.logger.error(`Failed to ping ${key} (${url}): ${error.message}`);
      }
    }

    this.logger.log('KeepAlive cron job completed.');
  }
}
