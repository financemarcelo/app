// Moneda de presentación (preferencia «moneda»): euros o dólares. Los cálculos dan cada importe
// en euros (…Eur) y su equivalente en dólares al tipo de su fecha (…Usd).
import { sesion } from "./sesion.js";
import * as f from "./formato.js";

export const moneda = () => (sesion.preferencias.moneda === "USD" ? "USD" : "EUR");

/** Campo en la moneda de presentación: en(r.valoracion, "total") lee totalEur o totalUsd. */
export const en = (objeto, campo) => objeto?.[`${campo}${moneda() === "USD" ? "Usd" : "Eur"}`];

export const dinero = (n) => f.dinero(n, moneda());
export const dineroEntero = (n) => f.dinero(n, moneda(), 0);
export const dineroSigno = (n) => f.dineroSigno(n, moneda());
/** Importe pequeño con céntimos y grande sin ellos. */
export const dineroAproximado = (n) => (Math.abs(n) < 100 ? dinero(n) : dineroEntero(n));
