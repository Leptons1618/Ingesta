// Quick test for DataTransformer date conversion
// Test the date conversion logic directly

class DataTransformer {
  static excelSerialToDate(serial) {
    const numSerial = typeof serial === 'string' ? parseFloat(serial) : serial;
    if (isNaN(numSerial)) {
      throw new Error(`Invalid serial number: ${serial}`);
    }
    
    // Excel treats 1900 as a leap year (it's not), so for dates after Feb 28, 1900, we subtract 1 day
    let adjustedSerial = numSerial;
    if (numSerial > 59) {
      adjustedSerial = numSerial - 1;
    }
    
    // Excel day 1 = January 1, 1900
    // Create date using UTC to avoid timezone issues
    const baseDate = new Date(1900, 0, 1); // January 1, 1900 in local time
    const utcBaseDate = Date.UTC(1900, 0, 1); // January 1, 1900 in UTC
    
    // Add days to the base date
    const resultDate = new Date(utcBaseDate + (adjustedSerial - 1) * 24 * 60 * 60 * 1000);
    
    return resultDate;
  }

  static formatDateForDatabase(date, dbType) {
    // Use UTC methods to avoid timezone issues
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    
    switch (dbType?.toLowerCase()) {
      case 'mysql':
      case 'postgresql':
      case 'mssql':
        return `${year}-${month}-${day}`;
      case 'sqlite':
        return `${year}-${month}-${day}`;
      default:
        return `${year}-${month}-${day}`;
    }
  }

  static transformCellValue(value, columnType) {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const type = columnType.toLowerCase();
    
    if (type === 'date' || type === 'datetime') {
      if (typeof value === 'number' || (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value))) {
        const serial = typeof value === 'string' ? parseFloat(value) : value;
        if (serial > 1 && serial < 3000000) { // Reasonable range for Excel serial dates
          const date = this.excelSerialToDate(serial);
          return this.formatDateForDatabase(date, 'postgresql');
        }
      }
      return value;
    }
    
    return value;
  }

  static transformDataRows(dataRows, columns) {
    return dataRows.map(row => {
      return row.map((cellValue, index) => {
        if (index >= columns.length) return cellValue;
        const column = columns[index];
        return this.transformCellValue(cellValue, column.type);
      });
    });
  }
}

// Test Excel serial dates from user's example
const testCases = [
  { serial: 45870, expected: "2025-08-01" },
  { serial: 45329, expected: "2024-03-20" },
  { serial: "45870", expected: "2025-08-01" }, // String version
  { serial: "45329", expected: "2024-03-20" }
];

// Let's also test some known dates to verify our formula
const knownTestCases = [
  { serial: 1, expected: "1900-01-01" }, // Excel day 1
  { serial: 25569, expected: "1970-01-01" }, // Unix epoch
  { serial: 44927, expected: "2023-01-01" }, // New Year 2023
];

console.log('Testing known Excel serial dates:');
console.log('=================================');

knownTestCases.forEach(({ serial, expected }) => {
  try {
    const converted = DataTransformer.excelSerialToDate(serial);
    const formatted = DataTransformer.formatDateForDatabase(converted, 'postgresql');
    console.log(`Serial: ${serial} → Date: ${converted.toISOString().split('T')[0]} → Formatted: ${formatted}`);
    console.log(`Expected: ${expected}, Match: ${formatted === expected ? '✓' : '✗'}`);
    console.log('---');
  } catch (error) {
    console.error(`Error converting ${serial}:`, error.message);
  }
});

console.log('Testing user provided Excel serial dates:');
console.log('=========================================');

testCases.forEach(({ serial, expected }) => {
  try {
    const converted = DataTransformer.excelSerialToDate(serial);
    const formatted = DataTransformer.formatDateForDatabase(converted, 'postgresql');
    console.log(`Serial: ${serial} → Date: ${converted.toISOString().split('T')[0]} → Formatted: ${formatted}`);
    console.log(`Expected: ${expected}, Match: ${formatted === expected ? '✓' : '✗'}`);
    console.log('---');
  } catch (error) {
    console.error(`Error converting ${serial}:`, error.message);
  }
});

// Test column configuration
const testColumns = [
  { name: 'id', type: 'INTEGER' },
  { name: 'date_column', type: 'DATE' },
  { name: 'name', type: 'TEXT' }
];

const testData = [
  [1, 45870, "John Doe"],
  [2, 45329, "Jane Smith"]
];

console.log('\nTesting data transformation:');
console.log('============================');

try {
  const transformed = DataTransformer.transformDataRows(testData, testColumns);
  console.log('Original data:', testData);
  console.log('Transformed data:', transformed);
} catch (error) {
  console.error('Transformation error:', error.message);
}
