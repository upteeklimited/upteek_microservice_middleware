// handshake/dto/handshake.dto.ts
export class VerificationPayload {
  userId: string;
  clientType: 'web' | 'mobile';
  data?: any; // optional additional payload
}

export class message {
  data?: any;
}

export class roomsData {
  type: string;
  client: string;
}