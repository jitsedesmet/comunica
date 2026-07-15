import { BusQueryOperation } from '..';

describe('BusQueryOperation', () => {
  describe('The BusQueryOperation module', () => {
    it('should be a function', () => {
      expect(BusQueryOperation).toBeInstanceOf(Function);
    });

    it('should be a BusQueryOperation constructor', () => {
      expect(new BusQueryOperation({ name: 'bus' }))
        .toBeInstanceOf(BusQueryOperation);
    });

    it('should not be able to create new BusQueryOperation objects without \'new\'', () => {
      expect(() => {
        (<any> BusQueryOperation)();
      }).toThrow(`Class constructor BusQueryOperation cannot be invoked without 'new'`);
    });
  });
});
