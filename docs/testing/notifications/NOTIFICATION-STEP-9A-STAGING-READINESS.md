# Notification system — Step 9a staging readiness

Date: 1 September 2026 (NZ)

## Result: ready for controlled staging run

Read-only staging checks confirmed:

| Check | Result |
| --- | --- |
| Active Admin accounts | 2 |
| Assigned open tasks | 10 |
| Assigned tasks due soon or overdue | 10 |
| Existing notification records | 0 |
| Existing delivery records | 0 |
| Reconciliation function | Active, version 3, JWT required |
| Unauthenticated request | Rejected (HTTP 401) |

## Step 9b test boundary

Use the existing dedicated staging Admin credentials through the controlled staging workflow. Run preview first, then one confirmed record-mode invocation. Verify records are created only in `operations_notifications`; `operations_notification_deliveries` must remain empty and no external message must be sent.
