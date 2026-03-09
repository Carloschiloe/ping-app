import { format } from 'date-fns';

/**
 * List of Chilean holidays for 2025
 * Format: 'MM-DD'
 */
const CHILE_HOLIDAYS_2025 = [
    '01-01', // Año Nuevo
    '04-18', // Viernes Santo
    '04-19', // Sábado Santo
    '05-01', // Día del Trabajo
    '05-21', // Glorias Navales
    '06-20', // Día Nacional de los Pueblos Indígenas
    '06-29', // San Pedro y San Pablo
    '07-16', // Virgen del Carmen
    '08-15', // Asunción de la Virgen
    '09-18', // Fiestas Patrias
    '09-19', // Glorias del Ejército
    '10-12', // Encuentro de Dos Mundos
    '10-31', // Día de las Iglesias Evangélicas
    '11-01', // Todos los Santos
    '12-08', // Inmaculada Concepción
    '12-25', // Navidad
];

/**
 * Checks if a given date is a holiday in Chile.
 * @param date The date to check
 * @returns boolean
 */
export const isChileanHoliday = (date: Date): boolean => {
    const monthDay = format(date, 'MM-DD');
    return CHILE_HOLIDAYS_2025.includes(monthDay);
};

/**
 * Checks if a given date is a "red day" (Sunday or Holiday in Chile).
 */
export const isRedDay = (date: Date): boolean => {
    const dayOfWeek = date.getDay();
    return dayOfWeek === 0 || isChileanHoliday(date);
};
