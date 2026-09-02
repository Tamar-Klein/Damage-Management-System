# Notification Server Modes - Documentation

## Overview

The Mock Notification Server has been enhanced to simulate different scenarios where external services may succeed or fail. This allows testing the system's resilience and behavior when the notification service is unreliable.

## Server Modes

The notification server supports 4 different modes:

### 1. **SUCCESS**
- Default mode
- All notification sending attempts succeed
- Notifications are logged with status `SENT`
- Behavior: System works as it did before the enhancement

### 2. **ALWAYS_FAIL**
- All notification sending attempts fail
- Every request logs a notification with status `FAILED`
- API endpoint `/notifications/send` returns `status: FAILED`
- Use case: Test error handling when external service is down

### 3. **FAIL_FIRST_ATTEMPT**
- First attempt to send to a specific building+email combination fails
- Subsequent attempts to the same building+email succeed
- Tracks attempted combinations internally
- Use case: Simulate transient failures or retry scenarios

### 4. **RANDOM_FAILURE**
- Approximately 30% of requests fail randomly
- 70% success rate across all requests
- Each request outcome is independent
- Use case: Simulate unreliable network conditions

## How It Works

### Notification Logging
- **All attempts are logged**, whether successful or failed
- Each log entry includes:
  - `messageId`: Unique identifier
  - `buildingId`: ID of the building
  - `email`: Recipient email
  - `subject`: Message subject
  - `body`: Message body
  - `timestamp`: When the request was made
  - `status`: Either `SENT` (success) or `FAILED` (failure)

### API Endpoints

#### GET `/notifications/mode`
Returns the current server mode and available modes.

**Response:**
```json
{
  "currentMode": "SUCCESS",
  "availableModes": ["SUCCESS", "ALWAYS_FAIL", "FAIL_FIRST_ATTEMPT", "RANDOM_FAILURE"]
}
```

#### POST `/notifications/mode`
Sets the server to a specific mode.

**Request:**
```json
{
  "mode": "ALWAYS_FAIL"
}
```

**Response:**
```json
{
  "currentMode": "ALWAYS_FAIL",
  "message": "Notification server mode changed to: ALWAYS_FAIL"
}
```

#### POST `/notifications/send`
Sends a notification (the behavior depends on current mode).

**Request:**
```json
{
  "buildingId": "uuid-123",
  "email": "family@example.com",
  "subject": "Test Subject",
  "body": "Test message body"
}
```

**Response (SUCCESS mode):**
```json
{
  "status": "SENT",
  "messageId": "uuid-msg-456"
}
```

**Response (ALWAYS_FAIL or triggered failure mode):**
```json
{
  "status": "FAILED",
  "messageId": "uuid-msg-789"
}
```

### UI Integration

The Notification Center (accessible via the Notifications button) includes a mode selector dropdown that allows you to:
1. View the current server mode
2. Switch between all 4 modes
3. See all sent and failed notifications with their statuses

**Status Badge Colors:**
- ✅ Green: `SENT` - Notification successfully sent
- ❌ Red: `FAILED` - Notification sending failed

## Testing Scenarios

### Scenario 1: Normal Operation
1. Set mode to `SUCCESS`
2. Create a report with a family email
3. Generate a return home package
4. Check Notification Center - should show `SENT` status

### Scenario 2: Service Down
1. Set mode to `ALWAYS_FAIL`
2. Create a report with a family email
3. Generate a return home package
4. Check Notification Center - should show `FAILED` status
5. Note: The package PDF is still generated (notifications are independent)

### Scenario 3: Transient Failure
1. Set mode to `FAIL_FIRST_ATTEMPT`
2. Create two reports with the same family email
3. Generate packages for both
4. First one should fail, second should succeed
5. Switch to another email and generate again - it will fail again

### Scenario 4: Unreliable Network
1. Set mode to `RANDOM_FAILURE`
2. Create multiple reports with family emails
3. Generate packages repeatedly
4. Check Notification Center - roughly 30% should fail, 70% succeed

## Important Notes

- ✅ **Package generation is independent** - Failures in notification sending do NOT affect PDF generation
- ✅ **Each request is processed once** - No automatic retries are implemented
- ✅ **Mode changes are immediate** - Changing modes affects subsequent requests only
- ✅ **All attempts are logged** - The system maintains a complete audit trail in `notifications.csv`
- ✅ **Simple and clear code** - The implementation is straightforward and maintainable

## Implementation Details

### Files Modified

1. **notificationServer.js**
   - Added `MODES` object with 4 mode definitions
   - Added `firstAttemptTracker` Map for tracking FAIL_FIRST_ATTEMPT mode
   - Added `shouldSucceed()` function to determine if send should succeed
   - Enhanced `sendNotification()` to set status based on current mode
   - Added `setMode()`, `getMode()`, `getModes()` methods

2. **server.js**
   - Added `GET /notifications/mode` endpoint
   - Added `POST /notifications/mode` endpoint

3. **public/app.js**
   - Updated `renderNotifications()` to:
     - Fetch and display current server mode
     - Show mode selector dropdown
     - Implement mode switching via UI
     - Display status badges with different colors (green for SENT, red for FAILED)

## CSV File Format

The `notifications.csv` file stores all notification attempts:

```
messageId,buildingId,email,subject,body,timestamp,status
8e4c5f9a-...,b3d2c1a-...,family@example.com,Test Subject,Message body,2026-07-08T...,SENT
a1b2c3d4-...,b3d2c1a-...,family@example.com,Test Subject,Message body,2026-07-08T...,FAILED
```

Each row represents one notification send attempt, whether it succeeded or failed.
