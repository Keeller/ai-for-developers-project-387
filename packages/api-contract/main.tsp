import "@typespec/http";
import "@typespec/openapi";

using Http;
using TypeSpec.OpenAPI;

@service(#{ title: "Calendar Booking API" })
@server("http://127.0.0.1:3000", "Local development")
namespace CalendarBooking;

@pattern("^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])?$")
@minLength(3)
@maxLength(64)
scalar EventTypePublicId extends string;

@minLength(3)
@maxLength(80)
scalar EventTypeName extends string;

@maxLength(500)
scalar EventTypeDescription extends string;

union DurationMinutes {
  m15: 15,
  m30: 30,
  m45: 45,
  m60: 60,
  m75: 75,
  m90: 90,
  m105: 105,
  m120: 120,
  m135: 135,
  m150: 150,
  m165: 165,
  m180: 180,
  m195: 195,
  m210: 210,
  m225: 225,
  m240: 240,
  m255: 255,
  m270: 270,
  m285: 285,
  m300: 300,
  m315: 315,
  m330: 330,
  m345: 345,
  m360: 360,
  m375: 375,
  m390: 390,
  m405: 405,
  m420: 420,
  m435: 435,
  m450: 450,
  m465: 465,
  m480: 480,
}

@minLength(1)
@maxLength(255)
scalar IanaTimeZone extends string;

@minLength(1)
@maxLength(200)
scalar GuestName extends string;

// The handler trims surrounding whitespace before validating the normalized
// address, so transport validation deliberately accepts a wider raw value.
@minLength(1)
@maxLength(512)
scalar GuestEmail extends string;

@minLength(16)
@maxLength(128)
scalar IdempotencyKey extends string;

@format("uuid")
scalar BookingId extends string;

@pattern("^(?:[01][0-9]|2[0-3]):(?:00|15|30|45)$")
scalar LocalAvailabilityTime extends string;

enum EventTypePublicationState {
  published: "published",
  hidden: "hidden",
}

enum Weekday {
  monday: "monday",
  tuesday: "tuesday",
  wednesday: "wednesday",
  thursday: "thursday",
  friday: "friday",
  saturday: "saturday",
  sunday: "sunday",
}

enum AvailabilityExceptionMode {
  closed: "closed",
  custom: "custom",
}

enum ErrorCode {
  validationError: "validation_error",
  notFound: "not_found",
  duplicatePublicId: "duplicate_public_id",
  eventTypeHasBookings: "event_type_has_bookings",
  eventTypeUnavailable: "event_type_unavailable",
  slotUnavailable: "slot_unavailable",
  idempotencyMismatch: "idempotency_mismatch",
  internalError: "internal_error",
}

model ApiError {
  code: ErrorCode;

  @minLength(1)
  @maxLength(500)
  message: string;

  fieldErrors?: Record<string[]>;
}

model Ok<T> {
  @statusCode statusCode: 200;
  @body body: T;
}

model Created<T> {
  @statusCode statusCode: 201;
  @body body: T;
}

model NoContent {
  @statusCode statusCode: 204;
}

model BadRequest {
  @statusCode statusCode: 400;
  @body body: ApiError;
}

model NotFound {
  @statusCode statusCode: 404;
  @body body: ApiError;
}

model Conflict {
  @statusCode statusCode: 409;
  @body body: ApiError;
}

model ServiceUnavailable {
  @statusCode statusCode: 503;
  @body body: ApiError;
}

/** The API process is ready to receive requests. */
model HealthResponse {
  status: "ok";
  service: "calendar-api";
}

model EventType {
  publicId: EventTypePublicId;
  name: EventTypeName;
  description?: EventTypeDescription;
  durationMinutes: DurationMinutes;
  publicationState: EventTypePublicationState;
  createdAt: utcDateTime;
  updatedAt: utcDateTime;
}

model PublicEventType {
  publicId: EventTypePublicId;
  name: EventTypeName;
  description?: EventTypeDescription;
  durationMinutes: DurationMinutes;
}

model EventTypeList {
  items: EventType[];
}

model PublicEventTypeList {
  items: PublicEventType[];
}

model CreateEventTypeRequest {
  publicId: EventTypePublicId;
  name: EventTypeName;
  description?: EventTypeDescription;
  durationMinutes: DurationMinutes;
}

model UpdateEventTypeRequest {
  name?: EventTypeName;
  description?: EventTypeDescription;
  durationMinutes?: DurationMinutes;
  publicationState?: EventTypePublicationState;
}

model AvailabilityInterval {
  start: LocalAvailabilityTime;
  end: LocalAvailabilityTime;
}

model WeeklyAvailabilityDay {
  weekday: Weekday;
  enabled: boolean;
  intervals: AvailabilityInterval[];
}

model Availability {
  timeZone: IanaTimeZone;
  week: WeeklyAvailabilityDay[];
  updatedAt: utcDateTime;
}

model ReplaceAvailabilityRequest {
  timeZone: IanaTimeZone;
  week: WeeklyAvailabilityDay[];
}

model AvailabilityException {
  date: plainDate;
  mode: AvailabilityExceptionMode;
  intervals: AvailabilityInterval[];
  updatedAt: utcDateTime;
}

model AvailabilityExceptionList {
  items: AvailabilityException[];
}

model PutAvailabilityExceptionRequest {
  mode: AvailabilityExceptionMode;
  intervals: AvailabilityInterval[];
}

model AvailableSlot {
  startAt: utcDateTime;
  endAt: utcDateTime;
  guestLocalDate: plainDate;
  guestLocalStart: plainTime;

  @pattern("^[+-][0-9]{2}:[0-9]{2}$")
  guestUtcOffset: string;
}

model SlotDay {
  ownerDate: plainDate;
  slots: AvailableSlot[];
}

model SlotWindow {
  eventType: PublicEventType;
  ownerTimeZone: IanaTimeZone;
  guestTimeZone: IanaTimeZone;
  /** Minutes between consecutive candidate Slot starts. */
  slotStepMinutes: 30;
  horizonStartsOn: plainDate;
  horizonEndsOn: plainDate;
  generatedAt: utcDateTime;
  days: SlotDay[];
}

model CreateBookingRequest {
  eventTypePublicId: EventTypePublicId;
  startAt: utcDateTime;
  guestName: GuestName;
  guestEmail: GuestEmail;
  guestTimeZone: IanaTimeZone;
}

model BookingEventSnapshot {
  publicId: EventTypePublicId;
  name: EventTypeName;
  durationMinutes: DurationMinutes;
}

model GuestContact {
  name: GuestName;
  email: GuestEmail;
  timeZone: IanaTimeZone;
}

model Booking {
  id: BookingId;
  eventType: BookingEventSnapshot;
  startAt: utcDateTime;
  endAt: utcDateTime;
  guest: GuestContact;
  createdAt: utcDateTime;
}

model FutureBookingList {
  calendarTimeZone: IanaTimeZone;
  items: Booking[];
}

/** Return the current API health status. */
@route("/api/health")
@get
op getHealth(): Ok<HealthResponse>;

@tag("Guest")
@route("/api/event-types")
interface GuestEventTypes {
  /** List every published event type. */
  @operationId("guestEventTypesListPublicEventTypes")
  @get
  listPublicEventTypes(): Ok<PublicEventTypeList> | ServiceUnavailable;

  /** Return one published event type by its immutable public ID. */
  @operationId("guestEventTypesGetPublicEventType")
  @route("/{publicId}")
  @get
  getPublicEventType(@path publicId: EventTypePublicId):
    | Ok<PublicEventType>
    | NotFound
    | ServiceUnavailable;

  /** Return free slots in the owner-local fourteen-day booking window. */
  @operationId("guestEventTypesListAvailableSlots")
  @route("/{publicId}/slots")
  @get
  listAvailableSlots(
    @path publicId: EventTypePublicId,
    @query guestTimeZone: IanaTimeZone,
  ): Ok<SlotWindow> | BadRequest | NotFound | ServiceUnavailable;
}

@tag("Guest")
@route("/api/bookings")
interface GuestBookings {
  /** Atomically create a booking or replay the original idempotent result. */
  @operationId("guestBookingsCreateBooking")
  @post
  createBooking(
    @header("Idempotency-Key") idempotencyKey: IdempotencyKey,
    @body body: CreateBookingRequest,
  ):
    | Created<Booking>
    | Ok<Booking>
    | BadRequest
    | NotFound
    | Conflict
    | ServiceUnavailable;
}

@tag("Owner")
@route("/api/manage/event-types")
interface OwnerEventTypes {
  /** List published and hidden event types. */
  @operationId("ownerEventTypesListEventTypes")
  @get
  listEventTypes(): Ok<EventTypeList> | ServiceUnavailable;

  /** Create a published event type. */
  @operationId("ownerEventTypesCreateEventType")
  @post
  createEventType(@body body: CreateEventTypeRequest):
    | Created<EventType>
    | BadRequest
    | Conflict
    | ServiceUnavailable;

  /** Return one event type for management. */
  @operationId("ownerEventTypesGetEventType")
  @route("/{publicId}")
  @get
  getEventType(@path publicId: EventTypePublicId):
    | Ok<EventType>
    | NotFound
    | ServiceUnavailable;

  /** Change mutable event type fields or its publication state. */
  @operationId("ownerEventTypesUpdateEventType")
  @route("/{publicId}")
  @patch
  updateEventType(
    @path publicId: EventTypePublicId,
    @body body: UpdateEventTypeRequest,
  ): Ok<EventType> | BadRequest | NotFound | Conflict | ServiceUnavailable;

  /** Permanently delete an event type that has never been booked. */
  @operationId("ownerEventTypesDeleteEventType")
  @route("/{publicId}")
  @delete
  deleteEventType(@path publicId: EventTypePublicId):
    | NoContent
    | NotFound
    | Conflict
    | ServiceUnavailable;
}

@tag("Owner")
@route("/api/manage/availability")
interface OwnerAvailability {
  /** Return the shared weekly availability and calendar timezone. */
  @operationId("ownerAvailabilityGetAvailability")
  @get
  getAvailability(): Ok<Availability> | ServiceUnavailable;

  /** Replace the shared weekly availability and calendar timezone. */
  @operationId("ownerAvailabilityReplaceAvailability")
  @put
  replaceAvailability(@body body: ReplaceAvailabilityRequest):
    | Ok<Availability>
    | BadRequest
    | ServiceUnavailable;

  /** List every configured dated availability exception. */
  @operationId("ownerAvailabilityListAvailabilityExceptions")
  @route("/exceptions")
  @get
  listAvailabilityExceptions():
    | Ok<AvailabilityExceptionList>
    | ServiceUnavailable;

  /** Create or replace the exception for one owner-local date. */
  @operationId("ownerAvailabilityPutAvailabilityException")
  @route("/exceptions/{date}")
  @put
  putAvailabilityException(
    @path date: plainDate,
    @body body: PutAvailabilityExceptionRequest,
  ): Ok<AvailabilityException> | BadRequest | ServiceUnavailable;

  /** Delete the exception for one owner-local date. */
  @operationId("ownerAvailabilityDeleteAvailabilityException")
  @route("/exceptions/{date}")
  @delete
  deleteAvailabilityException(@path date: plainDate):
    | NoContent
    | NotFound
    | ServiceUnavailable;
}

@tag("Owner")
@route("/api/manage/bookings")
interface OwnerBookings {
  /** List future bookings across all event types, sorted by start time. */
  @operationId("ownerBookingsListFutureBookings")
  @get
  listFutureBookings(): Ok<FutureBookingList> | ServiceUnavailable;
}
