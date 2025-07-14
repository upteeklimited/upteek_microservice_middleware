import { ClientData } from '../shared/presence.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class MessagesService {
  processMessage(payload: any, clientData: ClientData): string {
    // Process the message based on the payload and client data
    console.log(`Processing message from user ${clientData.userId}:`, payload);

    // Add your message processing logic here
    // For example: store in database, apply business rules, etc.

    return `Message processed successfully for user ${clientData.userId}`;
  }
}
