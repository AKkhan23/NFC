import mongoose from 'mongoose';

/** Service identities (`apikey:<id>`) are not ObjectIds — omit them from ObjectId refs. */
export function actorIdOrUndefined(actorId: string): string | undefined {
  return mongoose.Types.ObjectId.isValid(actorId) ? actorId : undefined;
}

/** Attribution for immutable records: user id when possible, else the key identity in metadata. */
export function actorAttribution(actorId: string): { actorId?: string; apiKey?: string } {
  const id = actorIdOrUndefined(actorId);
  return id ? { actorId: id } : { apiKey: actorId };
}
