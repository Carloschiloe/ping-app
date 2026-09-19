// Compatibility with Expo Calendar versions that no longer export the Calendar type.
// Derive the record from the installed getCalendarsAsync API rather than inventing its shape.
import 'expo-calendar';

declare module 'expo-calendar' {
  export type Calendar = Awaited<ReturnType<typeof getCalendarsAsync>>[number];
}
