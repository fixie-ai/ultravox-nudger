/**
 * Simple Date Availability Checker
 *
 * Returns availability for a requested date or suggests alternative dates.
 */

/**
 * Generate available time slots based on a date
 * @param {Date} date - Date object
 * @returns {Array<Date>} - Array of available time slot Date objects
 */
function getAvailableTimeSlots(date: Date) {
  // Extract values from the date to use as "random" seeds
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  // Use date components to create a "seed" for our pseudo-randomness
  const dateSeed = day + month + (year % 100);

  // Business hours from 9 AM to 5 PM
  const possibleHours = [9, 10, 11, 12, 13, 14, 15, 16];
  const possibleMinutes = [0, 30];

  // Array to store our available slots
  const availableSlots: Date[] = [];

  // Determine if this date is available at all (roughly 80% chance)
  const isDateAvailable = dateSeed % 5 !== 0;

  if (!isDateAvailable) {
    return []; // Return empty array if date is not available
  }

  // Determine how many slots will be available (between 3 and 5)
  const numberOfSlots = 3 + (dateSeed % 3);

  // Generate the available slots based on the date seed
  possibleHours.forEach((hour) => {
    // Skip some hours based on the date to create "randomness"
    if ((hour + dateSeed) % 3 === 0) {
      return;
    }

    possibleMinutes.forEach((minute) => {
      // Skip some minutes based on the date to create "randomness"
      if ((minute + day) % 2 === 0 && hour % 2 === 1) {
        return;
      }

      // Create a new Date object for this time slot
      const timeSlot = new Date(date);
      timeSlot.setHours(hour, minute, 0, 0);

      // Add the time slot to our available slots
      availableSlots.push(timeSlot);
    });
  });

  // Ensure we don't have too many slots by limiting to our numberOfSlots
  return availableSlots.slice(0, numberOfSlots);
}

/**
 * Gets neighboring dates (1-3 days before and after the requested date)
 * @param {Date} date - The requested date
 * @returns {Array<Date>} - Array of neighboring dates
 */
function getNeighboringDates(date: Date) {
  const neighbors = [];

  // Get up to 3 days before and 3 days after
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue; // Skip the original date

    const neighborDate = new Date(date);
    neighborDate.setDate(date.getDate() + i);
    neighbors.push(neighborDate);
  }

  return neighbors;
}

/**
 * Check availability and return formatted results
 * @param {Date|string} dateInput - Date to check
 * @returns {Object} - Object with isExactAvailable and suggestedTimes
 */
export function checkDateAvailability(dateInput: string | Date) {
  // Convert to date object if string was passed
  const date =
    typeof dateInput === "string" ? new Date(dateInput) : new Date(dateInput);

  // Clear time portion to ensure we're just working with the date
  date.setHours(0, 0, 0, 0);

  // Get available slots for the requested date
  const exactDaySlots = getAvailableTimeSlots(date);
  const isExactAvailable = exactDaySlots.length > 0;

  // If the exact day is available, return its slots
  if (isExactAvailable) {
    return {
      isExactAvailable: true,
      suggestedTimes: exactDaySlots,
    };
  }

  // If the exact day is not available, check neighboring days
  const neighboringDates = getNeighboringDates(date);
  let suggestedTimes: Date[] = [];

  // Check each neighboring date for availability
  for (const neighborDate of neighboringDates) {
    const neighborSlots = getAvailableTimeSlots(neighborDate);
    suggestedTimes = suggestedTimes.concat(neighborSlots);

    // If we have at least 5 suggestions, stop looking
    if (suggestedTimes.length >= 5) break;
  }

  // Sort the suggested times chronologically
  suggestedTimes.sort((a, b) => a.valueOf() - b.valueOf());

  // Limit to a reasonable number of suggestions
  suggestedTimes = suggestedTimes.slice(0, 5);

  return {
    isExactAvailable: false,
    suggestedTimes: suggestedTimes,
  };
}
