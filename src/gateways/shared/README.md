# Gateway Refactoring Documentation

## Overview

The gateways have been refactored to centralize common logic while keeping them modular and separated by concern. This architecture provides:

- **Centralized Connection Management**: All connection handling is managed by the `PresenceService`
- **Shared Base Gateway**: Common functionality is provided by the `BaseGateway` class
- **Modular Design**: Each gateway focuses only on its specific domain logic
- **Reusable Components**: Common services can be shared across all gateways
- **Namespace Isolation**: Each gateway operates in its own namespace for better organization
- **Flexible Authentication**: Clients can provide authentication data at any time during their session
- **WebSocket Authentication**: Bearer token authentication with backend server integration
- **Public/Private Namespaces**: Support for both authenticated and public WebSocket connections

## Architecture

### 1. PresenceService (`src/gateways/shared/presence.service.ts`)

Central service that manages:

- User ↔ socket mappings
- Connection lifecycle hooks
- Room management logic
- Client data tracking
- Namespace-based organization
- Dynamic client data updates

**Key Features:**

- `registerClient()` / `unregisterClient()` - Connection lifecycle
- `updateClientData()` - Update client information after initial connection
- `addClientToRoom()` / `removeClientFromRoom()` - Room management
- `getUserSockets()` - Get all sockets for a user
- `getNamespaceClients()` - Get all clients for a namespace
- `hasClientTypeInRoom()` - Check room composition
- `disconnectRoom()` - Force disconnect all clients in a room
- `getNamespaceStats()` - Get namespace-specific statistics
- `emitServerMessage()` - Emit message to all connected clients
- `emitClientMessage()` - Emit message to a specific client
- `isClientConnected()` - Check if client is still connected

### 2. BaseGateway (`src/gateways/shared/base.gateway.ts`)

Abstract base class that provides:

- Common connection handling (`handleConnection`, `handleDisconnect`)
- Authentication utilities (`isAuthenticated`, `extractUserId`)
- Message broadcasting utilities (`emitToRoom`, `emitToClient`, `broadcast`)
- Client data access (`getClientData`)
- Namespace extraction (`extractNamespace`)
- Client data updates (`updateClientData`)
- Client message emission (`emitClientMessage`)

### 3. WebSocket Authentication System

#### AuthService (`src/gateways/services/auth.service.ts`)

- Bearer token verification with backend server
- **Target URL resolution** based on client type (admin/user/bank)
- User data extraction and validation
- Role and permission checking
- Synchronous token verification for guards
- **Dynamic server selection** using environment variables (ADMIN, USERS, BANK)

#### WebSocketAuthGuard (`src/gateways/guards/websocket-auth.guard.ts`)

- Validates bearer tokens on connection
- Enforces client type requirements (`x-client-type` header)
- Supports public namespaces (no authentication required)
- Stores user data in socket for later use

#### Public Decorator (`src/gateways/decorators/public.decorator.ts`)

- `@PublicWebSocket()` - Marks gateway as public (no auth required)
- `@WebSocketAuth(options)` - Configures authentication options

### 4. Domain-Specific Gateways

Each gateway extends `BaseGateway` and operates in its own namespace:

#### VerificationGateway (`/verification` namespace) - **PUBLIC**

- Handles verification room creation and management
- Manages mobile/web client pairing
- Processes verification-specific events
- Updates client data when userId is provided in `join_room` message
- **No authentication required** - marked with `@PublicWebSocket()`

#### MessagesGateway (`/messages` namespace) - **AUTHENTICATED**

- Handles chat room management with **sorter method** for consistent room names
- Processes message events
- Manages user presence in chat rooms
- Handles anonymous clients and updates their data when userId becomes available
- **Requires authentication** - protected by `@UseGuards(WebSocketAuthGuard)`
- **Smart room creation**: First person creates room, second person joins existing room
- **Consistent room naming**: Room names are always sorted alphabetically regardless of join order

#### P2P Room Restrictions and Message Broadcasting (NEW)

- **P2P Room Limit**: Each chat room can have at most 2 different users. If a third user attempts to join, they will be rejected unless they are the same user joining from another device or tab.
- **Multiple Devices/Tabs**: The same user can join the same room from multiple devices or browser tabs.
- **User Validation**: When joining a room, the system checks if the user is already present. If not, and the room already has 2 different users, the join is rejected.
- **Room-Based Messaging**: Messages are now broadcast to the entire room using `emitToRoom`, ensuring both users (and all their devices/tabs) receive the message in real-time.
- **No Group Chat**: Only P2P (one-on-one) chats are supported. Group chats with more than 2 users are not allowed.

##### Example: P2P Room Join and Messaging

```javascript
// User A joins the room
messagesSocket.emit('join_chat', {
  clientType: 'web',
  client_a: 'userA',
  client_b: 'userB'
});

// User B joins the same room
messagesSocket.emit('join_chat', {
  clientType: 'web',
  client_a: 'userB',
  client_b: 'userA'
});

// User A sends a message (received by both A and B)
messagesSocket.emit('message', {
  text: 'Hello from A!'
});
```

##### Error Example: Room Full

```javascript
// User C tries to join the same room
messagesSocket.emit('join_chat', {
  clientType: 'web',
  client_a: 'userC',
  client_b: 'userA'
});
// Response:
// { success: false, message: 'Room is full. Only 2 users allowed in P2P chat rooms.' }
```

##### Summary
- Use `join_chat` to join a P2P room. Only 2 different users allowed.
- Use `message` to send messages to the room. All devices/tabs for both users receive the message.
- Attempts to join a full room by a third user will be rejected.

## WebSocket Authentication

### Authentication Flow

1. **Client Connection** → WebSocketAuthGuard intercepts
2. **Token Extraction** → Bearer token extracted from headers/auth/query
3. **Token Verification** → AuthService verifies with backend server
4. **User Data Storage** → User data stored in socket.data
5. **Connection Established** → Gateway methods can access user data

### Public vs Private Namespaces

#### Public Namespaces (No Authentication)

```typescript
@WebSocketGateway({ namespace: 'verification' })
@PublicWebSocket()
export class VerificationGateway extends BaseGateway {
  // No authentication required
}
```

#### Private Namespaces (Authentication Required)

```typescript
@WebSocketGateway({ namespace: 'messages' })
@UseGuards(WebSocketAuthGuard)
export class MessagesGateway extends BaseGateway {
  // Authentication required
}
```

### Client Connection Examples

#### Public Namespace (Verification)

```javascript
// No authentication required
const verificationSocket = io('http://localhost:3000/verification', {
  headers: {
    'x-client-type': 'user' // Optional but recommended (admin/user/bank)
  }
});
```

#### Private Namespace (Messages)

```javascript
// Authentication required
const messagesSocket = io('http://localhost:3000/messages', {
  headers: {
    'Authorization': 'Bearer your-jwt-token-here',
    'x-client-type': 'user' // Required (admin/user/bank)
  }
});

// Alternative: Using auth object
const messagesSocket = io('http://localhost:3000/messages', {
  auth: {
    token: 'your-jwt-token-here',
    clientType: 'user'
  }
});
```

### Authentication Configuration

#### Environment Variables

```bash
# Target server URLs for different client types (same as ProxyService)
ADMIN=http://localhost:3001
USERS=http://localhost:3002
BANK=http://localhost:3003

# Auth server URL for token verification (fallback)
AUTH_SERVER_URL=http://localhost:3000
```

#### Target URL Resolution

The AuthService now uses the same target URL resolution logic as the ProxyService:

```typescript
// AuthService.getTargetUrl() method
const SERVER_URLS = {
  admin: process.env.ADMIN || '',
  user: process.env.USERS || '',
  bank: process.env.BANK || '',
};

// Token verification uses the appropriate server based on client type
const targetUrl = this.getTargetUrl(clientType);
const verifyEndpoint = `${targetUrl}/api/auth/verify`;
```

**Benefits:**
- **Consistent routing**: Same logic as ProxyService for server selection
- **Environment-based**: Uses environment variables for server URLs
- **Client type aware**: Different servers for different client types
- **Fallback support**: Graceful handling of missing environment variables

#### Client Type Validation

The WebSocketAuthGuard validates client types using the same logic as the ProxyService:

```typescript
// Valid client types (case-insensitive)
const validClientTypes = ['admin', 'user', 'bank'];

// Client type is stored in lowercase
client.data.clientType = clientType.toLowerCase();
```

**Benefits:**
- **Consistent validation**: Same client types as ProxyService
- **Case-insensitive**: Accepts any case (Admin, ADMIN, admin)
- **Environment mapping**: Maps to appropriate server URLs
- **Clear error messages**: Specific validation error messages

#### AuthService Configuration

```typescript
// Token verification endpoint
POST ${AUTH_SERVER_URL}/api/auth/verify
{
  "token": "your-jwt-token"
}

// Expected response
{
  "valid": true,
  "user": {
    "userId": "user123",
    "email": "user@example.com",
    "username": "testuser",
    "roles": ["user"],
    "permissions": ["read", "write"]
  }
}
```

### User Data Access in Gateways

```typescript
@SubscribeMessage('message')
handleMessage(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
  // Access user data from authenticated socket
  const user = client.data?.user;
  if (user) {
    console.log(`Message from user: ${user.userId}`);
    
    // Check roles and permissions
    if (this.authService.hasRole(user, 'admin')) {
      // Admin-specific logic
    }
    
    if (this.authService.hasPermission(user, 'write')) {
      // Write permission logic
    }
  }
}
```

## Client Registration & Authentication Flow

### Initial Connection

All clients are registered immediately upon connection, even without authentication data:

```typescript
// Client connects without userId
const socket = io('http://localhost:3000/verification');

// Client is registered with placeholder data
// userId: 'anonymous', clientType: undefined, namespace: '/verification'
```

### Authentication Update

Clients can provide authentication data at any time during their session:

```typescript
// Client sends authentication data
socket.emit('join_room', {
  userId: 'user123',
  clientType: 'web'
});

// Client data is updated in PresenceService
// userId: 'user123', clientType: 'web', namespace: '/verification'
```

### Benefits of This Approach

1. **No Connection Failures**: Clients always connect successfully
2. **Flexible Authentication**: Authentication can happen at any time
3. **Better User Experience**: No need to reconnect after authentication
4. **Graceful Handling**: Anonymous clients are tracked but clearly marked
5. **Debugging**: Clear logging shows client lifecycle
6. **Security**: Bearer token validation with backend server
7. **Client Type Validation**: Enforces proper client type headers

## Namespace Implementation

### Connection URLs

Clients connect to specific namespaces:

```javascript
// Connect to verification namespace (public)
const verificationSocket = io('http://localhost:3000/verification');

// Connect to messages namespace (authenticated)
const messagesSocket = io('http://localhost:3000/messages');
```

### Namespace Benefits

1. **Isolation**: Events and rooms are isolated per namespace
2. **Organization**: Clear separation of concerns
3. **Scalability**: Easy to add new namespaces for new features
4. **Security**: Can apply different authentication/authorization per namespace
5. **Performance**: Better resource management and monitoring

### Namespace Statistics

```typescript
// Get stats for a specific namespace
const verificationStats = this.getNamespaceStats('verification');
console.log(`Verification clients: ${verificationStats.clients}`);
console.log(`Verification rooms: ${verificationStats.rooms}`);

// Get all namespace stats
const allStats = this.getConnectionStats();
console.log(`Total namespaces: ${allStats.totalNamespaces}`);
```

## Usage Examples

### Creating a New Namespace Gateway

#### Public Gateway

```typescript
import { SubscribeMessage, ConnectedSocket, MessageBody, WebSocketGateway } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { BaseGateway } from '../shared/base.gateway';
import { PresenceService } from '../shared/presence.service';
import { PublicWebSocket } from '../decorators/public.decorator';

@WebSocketGateway({
  namespace: 'notifications',
  cors: { origin: '*' },
})
@PublicWebSocket()
export class NotificationGateway extends BaseGateway {
  constructor(presenceService: PresenceService) {
    super(presenceService);
  }

  @SubscribeMessage('subscribe_notifications')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { userId: string }
  ) {
    // Update client data with provided userId
    this.updateClientData(client.id, {
      userId: payload.userId,
      clientType: 'notification'
    });

    const roomName = `notifications_${payload.userId}`;
    const namespace = this.extractNamespace(client);
    
    client.join(roomName);
    
    this.presenceService.addClientToRoom(roomName, {
      type: 'notification',
      client: client.id,
      namespace,
    });

    return { success: true, message: 'Subscribed to notifications' };
  }
}
```

#### Private Gateway

```typescript
import { SubscribeMessage, ConnectedSocket, MessageBody, WebSocketGateway } from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { Socket } from 'socket.io';
import { BaseGateway } from '../shared/base.gateway';
import { PresenceService } from '../shared/presence.service';
import { WebSocketAuthGuard } from '../guards/websocket-auth.guard';

@WebSocketGateway({
  namespace: 'secure',
  cors: { origin: '*' },
})
@UseGuards(WebSocketAuthGuard)
export class SecureGateway extends BaseGateway {
  constructor(presenceService: PresenceService) {
    super(presenceService);
  }

  @SubscribeMessage('secure_message')
  handleSecureMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: any
  ) {
    // User data is automatically available from authentication
    const user = client.data?.user;
    console.log(`Secure message from authenticated user: ${user?.userId}`);
    
    return { success: true, message: 'Secure message processed' };
  }
}
```

### Using PresenceService with Namespaces

```typescript
// Get all clients in a specific namespace
const verificationClients = this.presenceService.getNamespaceClients('verification');

// Get rooms for a specific namespace
const verificationRooms = this.presenceService.getNamespaceRooms('verification');

// Get namespace-specific statistics
const stats = this.presenceService.getNamespaceStats('messages');
console.log(`Messages clients: ${stats.clients}, rooms: ${stats.rooms}`);

// Update client data
this.presenceService.updateClientData(clientId, {
  userId: 'newUserId',
  clientType: 'mobile'
});

// Emit message to all clients
this.presenceService.emitServerMessage(server, 'System maintenance', { scheduled: true });

// Emit message to specific client
this.presenceService.emitClientMessage(server, clientId, 'Welcome message', { userId: 'user123' });
```

### Messages Gateway - Join Chat Functionality

#### Join Chat Payload

The `join_chat` event requires a specific payload structure:

```typescript
interface JoinChatPayload {
  clientType: string;  // 'admin', 'user', or 'bank'
  client_a: string;    // First client ID (sender)
  client_b: string;    // Second client ID (receiver)
}
```

#### Sorter Method

The gateway uses a sorter method to ensure consistent room names:

```typescript
// Room names are always sorted alphabetically
// client_a: "user123", client_b: "admin456" → room: "chat_room_admin456_user123"
// client_a: "admin456", client_b: "user123" → room: "chat_room_admin456_user123"
```

#### Room Creation Logic

1. **First Person**: Creates the room and receives `room_created` event
2. **Second Person**: Joins existing room and receives `user_joined` event
3. **Consistent Naming**: Both get the same room name regardless of join order

#### Client Examples

```javascript
// First person joining (creates room)
messagesSocket.emit('join_chat', {
  clientType: 'user',
  client_a: 'user123',
  client_b: 'admin456'
});

// Second person joining (joins existing room)
messagesSocket.emit('join_chat', {
  clientType: 'admin',
  client_a: 'admin456',  // Can be in reverse order
  client_b: 'user123'    // Room name will still be consistent
});

// Both will be in the same room: "chat_room_admin456_user123"
```

#### Event Responses

**First Person (Room Creator):**
```javascript
{
  success: true,
  message: "Created chat room: chat_room_admin456_user123",
  roomName: "chat_room_admin456_user123",
  isFirstPerson: true
}
```

**Second Person (Room Joiner):**
```javascript
{
  success: true,
  message: "Joined chat room: chat_room_admin456_user123",
  roomName: "chat_room_admin456_user123",
  isFirstPerson: false
}
```

#### Error Handling

**Missing Fields:**
```javascript
{
  success: false,
  message: "Missing required fields: clientType, client_a, client_b"
}
```

**Invalid Client Type:**
```javascript
{
  success: false,
  message: "Invalid client type. Must be one of: admin, user, bank"
}
```

#### Leave Chat

```javascript
// Leave a chat room
messagesSocket.emit('leave_chat', {
  client_a: 'user123',
  client_b: 'admin456'
});
```

### Client-Side Connection

#### Public Namespace

```javascript
// Connect to verification namespace (no auth required)
const verificationSocket = io('http://localhost:3000/verification', {
  headers: {
    'x-client-type': 'user' // Optional but recommended (admin/user/bank)
  }
});
```

// Provide authentication data later
verificationSocket.emit('join_room', {
  userId: 'user123',
  clientType: 'web'
});
```

#### Private Namespace

```javascript
// Connect to messages namespace (auth required)
const messagesSocket = io('http://localhost:3000/messages', {
  headers: {
    'Authorization': 'Bearer your-jwt-token-here',
    'x-client-type': 'user' // Required (admin/user/bank)
  }
});

// Alternative: Using auth object
const messagesSocket = io('http://localhost:3000/messages', {
  auth: {
    token: 'your-jwt-token-here',
    clientType: 'user'
  }
});
```

### Handling Anonymous Clients

```typescript
@SubscribeMessage('authenticate')
handleAuthentication(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: { userId: string; clientType: string }
) {
  // Update anonymous client with real authentication data
  this.updateClientData(client.id, {
    userId: payload.userId,
    clientType: payload.clientType
  });

  // Send welcome message to the authenticated client
  this.emitClientMessage(client.id, 'Authentication successful', {
    userId: payload.userId,
    timestamp: new Date().toISOString()
  });

  return { success: true, message: 'Authentication successful' };
}
```

## Troubleshooting

### Common Issues

#### 1. Client Data is Undefined

**Problem**: `clientData` is `undefined` when trying to unregister a client.

**Solution**: This was fixed by ensuring all clients are registered immediately upon connection, even without authentication data.

#### 2. Authentication Timing Issues

**Problem**: Clients need to provide authentication data during connection.

**Solution**: Clients can now provide authentication data at any time using `updateClientData()`.

#### 3. Namespace Isolation

**Problem**: Events from one namespace affecting another.

**Solution**: Each gateway operates in its own namespace, providing complete isolation.

#### 4. Authentication Failures

**Problem**: WebSocket connections failing due to authentication issues.

**Solution**:

- Ensure bearer token is valid and not expired
- Verify `x-client-type` header is provided and valid
- Check auth server is accessible and responding
- Use `@PublicWebSocket()` for namespaces that don't require authentication

#### 5. Token Verification Issues

**Problem**: Token verification failing or timing out.

**Solution**:

- Verify `AUTH_SERVER_URL` environment variable is set correctly
- Ensure auth server endpoint `/api/auth/verify` is available
- Check network connectivity to auth server
- Review auth server logs for verification failures

### Debugging

Enable debug logging to track client lifecycle:

```typescript
// Connection logs
console.log(`Socket connected: ${client.id}`);
console.log(`Connection details - userId: ${userId}, clientType: ${clientType}, namespace: ${namespace}`);

// Authentication logs
console.log(`Authentication successful for client ${client.id}, user: ${userData.userId}`);
console.log(`Authentication failed for client ${client.id}: ${error.message}`);

// Registration logs
console.log(`Client ${client.id} registered successfully`);

// Update logs
console.log(`Client ${client.id} data updated:`, updates);

// Disconnection logs
console.log(`Socket disconnected: ${client.id}`);
console.log(`Unregistering client ${client.id} with data:`, clientData);
```

## Benefits

1. **DRY Principle**: No code duplication across gateways
2. **Consistency**: All gateways handle connections the same way
3. **Maintainability**: Changes to connection logic only need to be made in one place
4. **Scalability**: Easy to add new gateways with consistent behavior
5. **Modularity**: Each gateway focuses only on its specific domain logic
6. **Namespace Isolation**: Clear separation between different features
7. **Better Organization**: Events and rooms are organized by namespace
8. **Enhanced Monitoring**: Namespace-specific statistics and monitoring
9. **Flexible Authentication**: Clients can authenticate at any time
10. **Robust Error Handling**: No more undefined client data issues
11. **Security**: Bearer token authentication with backend integration
12. **Client Type Validation**: Enforces proper client identification
13. **Public/Private Support**: Flexible authentication requirements per namespace

## Migration Notes

- All existing gateway functionality has been preserved
- Gateways now operate in isolated namespaces (`/verification`, `/messages`)
- The `PresenceService` now tracks namespace information and supports dynamic updates
- Client connections must specify the appropriate namespace
- Namespace-specific statistics are available for monitoring
- **NEW**: All clients are registered immediately upon connection
- **NEW**: Client data can be updated at any time using `updateClientData()`
- **NEW**: Anonymous clients are supported with placeholder userId
- **NEW**: WebSocket authentication system with bearer token support
- **NEW**: Public/private namespace support with decorators
- **NEW**: Client type validation with `x-client-type` header
- **NEW**: Backend server integration for token verification
- The `VerificationService` has been simplified to focus on verification-specific logic
- The `MessagesService` has been enhanced with message processing capabilities
- Connection handling is now centralized in the `PresenceService`
