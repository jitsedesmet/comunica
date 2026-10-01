import { BigNumber as BigNumberConstructor } from 'bignumber.js';

/**
 * Arbitrary-precision numbers, used to represent unbounded XSD integers and decimals.
 *
 * The named `BigNumber` export of bignumber.js only refers to the constructor (and not to the instance type),
 * so this re-export allows `BigNumber` to be used as both a value and a type.
 */
export const BigNumber = BigNumberConstructor;
// eslint-disable-next-line ts/no-redeclare -- BigNumber is intentionally both a value and a type
export type BigNumber = InstanceType<typeof BigNumberConstructor>;
