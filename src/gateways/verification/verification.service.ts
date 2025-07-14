import { Injectable } from '@nestjs/common';
import { PresenceService } from '../shared/presence.service';

@Injectable()
export class VerificationService {
  constructor(private readonly presenceService: PresenceService) {}

  /**
   * Get verification-specific statistics
   */
  getVerificationStats() {
    const allRooms = this.presenceService.getAllRoomsData();
    const verificationRooms = new Map();
    
    // Filter only verification rooms
    for (const [roomName, roomData] of allRooms) {
      if (roomName.startsWith('verification_room_')) {
        verificationRooms.set(roomName, roomData);
      }
    }
    
    return {
      totalVerificationRooms: verificationRooms.size,
      verificationRooms: verificationRooms,
    };
  }

  /**
   * Get verification room data for a specific user
   */
  getVerificationRoomData(userId: string) {
    const roomName = `verification_room_${userId}`;
    return this.presenceService.getRoomData(roomName);
  }

  /**
   * Check if user has active verification session
   */
  hasActiveVerification(userId: string): boolean {
    const roomName = `verification_room_${userId}`;
    return this.presenceService.roomExists(roomName);
  }

  /**
   * Get all active verification sessions
   */
  getActiveVerifications() {
    const allRooms = this.presenceService.getAllRoomsData();
    const activeVerifications = [];
    
    for (const [roomName, roomData] of allRooms) {
      if (roomName.startsWith('verification_room_')) {
        const userId = roomName.replace('verification_room_', '');
        activeVerifications.push({
          userId,
          roomName,
          participants: roomData,
        });
      }
    }
    
    return activeVerifications;
  }
}
