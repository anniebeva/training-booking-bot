import { createClient } from '@supabase/supabase-js';

let supabase = null;

export function initSupabase(url, key) {
  supabase = createClient(url, key);
  return supabase;
}

export function getSupabase() {
  return supabase;
}

export async function getUser(telegramId, username = null) {
  let { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single();
  
  if (error && error.code === 'PGRST116') {
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert([{ telegram_id: telegramId, username, sessions_left: 3, role: 'user' }])
      .select()
      .single();
    if (insertError) throw insertError;
    return newUser;
  }
  if (error) throw error;
  return user;
}

export async function updateUserSessions(telegramId, sessionsLeft) {
  const { error } = await supabase
    .from('users')
    .update({ sessions_left: sessionsLeft })
    .eq('telegram_id', telegramId);
  if (error) throw error;
}

export async function getTrainers() {
  const { data, error } = await supabase
    .from('trainers')
    .select('*')
    .order('id');
  if (error) throw error;
  return data;
}

export async function getFreeSlots(trainerId, date) {
  const { data, error } = await supabase
    .from('schedule')
    .select('*')
    .eq('trainer_id', trainerId)
    .eq('date', date);
  if (error) throw error;
  return data.filter(slot => slot.booked_slots < slot.max_slots);
}

export async function getScheduleSlotById(slotId) {
  const { data, error } = await supabase
    .from('schedule')
    .select('*')
    .eq('id', slotId)
    .single();
  if (error) throw error;
  return data;
}

export async function incrementBookedSlots(slotId) {
  const { data: slot, error: fetchError } = await supabase
    .from('schedule')
    .select('booked_slots')
    .eq('id', slotId)
    .single();
  if (fetchError) throw fetchError;
  
  const { error: updateError } = await supabase
    .from('schedule')
    .update({ booked_slots: slot.booked_slots + 1 })
    .eq('id', slotId);
  if (updateError) throw updateError;
}

export async function decrementBookedSlots(slotId) {
  const { data: slot, error: fetchError } = await supabase
    .from('schedule')
    .select('booked_slots')
    .eq('id', slotId)
    .single();
  if (fetchError) throw fetchError;
  
  const { error: updateError } = await supabase
    .from('schedule')
    .update({ booked_slots: Math.max(0, slot.booked_slots - 1) })
    .eq('id', slotId);
  if (updateError) throw updateError;
}

export async function createBooking(bookingId, userId, scheduleId, trainerName, datetime) {
  const { error } = await supabase
    .from('bookings')
    .insert([{
      id: bookingId,
      user_id: userId,
      schedule_id: scheduleId,
      trainer_name: trainerName,
      datetime: datetime
    }]);
  if (error) throw error;
}

export async function getUserBookings(userId) {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('user_id', userId)
    .gt('datetime', new Date().toISOString())
    .order('datetime');
  if (error) throw error;
  return data || [];
}

export async function getAllUserBookings(userId) {
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return data || [];
}

export async function deleteBooking(bookingId, scheduleId) {
  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', bookingId);
  if (error) throw error;
  await decrementBookedSlots(scheduleId);
}