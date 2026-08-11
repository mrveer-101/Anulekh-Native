const fs = require('fs');
const path = require('path');

const featherPath = path.join(__dirname, '../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Feather.ttf');
const ioniconsPath = path.join(__dirname, '../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf');
const materialPath = path.join(__dirname, '../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf');

const featherB64 = fs.readFileSync(featherPath).toString('base64');
const ioniconsB64 = fs.readFileSyncioniconsPath = fs.readFileSync(ioniconsPath).toString('base64');
const materialB64 = fs.readFileSync(materialPath).toString('base64');

const cssContent = `/* Base64 Embedded Vector Fonts for React Native Web PWA */
@font-face {
  font-family: 'Feather';
  src: url('data:font/truetype;charset=utf-8;base64,${featherB64}') format('truetype');
  font-weight: normal;
  font-style: normal;
}
@font-face {
  font-family: 'Ionicons';
  src: url('data:font/truetype;charset=utf-8;base64,${ioniconsB64}') format('truetype');
  font-weight: normal;
  font-style: normal;
}
@font-face {
  font-family: 'MaterialIcons';
  src: url('data:font/truetype;charset=utf-8;base64,${materialB64}') format('truetype');
  font-weight: normal;
  font-style: normal;
}
@font-face {
  font-family: 'Material Icons';
  src: url('data:font/truetype;charset=utf-8;base64,${materialB64}') format('truetype');
  font-weight: normal;
  font-style: normal;
}
`;

const outputPath = path.join(__dirname, '../src/vector-fonts-b64.css');
fs.writeFileSync(outputPath, cssContent);
console.log('Successfully generated Base64 vector fonts CSS at:', outputPath);
