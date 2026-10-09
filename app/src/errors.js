export class UserError extends Error {}
export function userMessage(error) {
  return error instanceof UserError ? error.message : 'Something went wrong. Please retry or contact the app administrator.';
}
