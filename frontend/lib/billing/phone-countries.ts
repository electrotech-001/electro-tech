export type PhoneCountry = {
  iso: string;
  name: string;
  dial: string;
  min: number;
  max: number;
  example: string;
  groups: number[];
};

type CountryRow = [iso: string, name: string, dial: string, min: number, max: number, groups: number[]];

function groupPhoneDigits(digits: string, groups: number[]): string {
  const parts: string[] = [];
  let index = 0;
  for (const size of groups) {
    if (index >= digits.length) break;
    parts.push(digits.slice(index, index + size));
    index += size;
  }
  if (index < digits.length) parts.push(digits.slice(index));
  return parts.join(" ");
}

function country(iso: string, name: string, dial: string, min: number, max: number, groups: number[]): PhoneCountry {
  return {
    iso,
    name,
    dial,
    min,
    max,
    groups,
    example: iso === "PK" ? "0300-0000000" : groupPhoneDigits("9".repeat(max), groups),
  };
}

const rows: CountryRow[] = [
  ["PK", "Pakistan", "92", 11, 11, [4, 7]],
  ["US", "United States", "1", 10, 10, [3, 3, 4]],
  ["CA", "Canada", "1", 10, 10, [3, 3, 4]],
  ["AG", "Antigua and Barbuda", "1", 10, 10, [3, 3, 4]],
  ["AI", "Anguilla", "1", 10, 10, [3, 3, 4]],
  ["AS", "American Samoa", "1", 10, 10, [3, 3, 4]],
  ["BB", "Barbados", "1", 10, 10, [3, 3, 4]],
  ["BM", "Bermuda", "1", 10, 10, [3, 3, 4]],
  ["BS", "Bahamas", "1", 10, 10, [3, 3, 4]],
  ["DM", "Dominica", "1", 10, 10, [3, 3, 4]],
  ["DO", "Dominican Republic", "1", 10, 10, [3, 3, 4]],
  ["GD", "Grenada", "1", 10, 10, [3, 3, 4]],
  ["GU", "Guam", "1", 10, 10, [3, 3, 4]],
  ["JM", "Jamaica", "1", 10, 10, [3, 3, 4]],
  ["KN", "Saint Kitts and Nevis", "1", 10, 10, [3, 3, 4]],
  ["KY", "Cayman Islands", "1", 10, 10, [3, 3, 4]],
  ["LC", "Saint Lucia", "1", 10, 10, [3, 3, 4]],
  ["MP", "Northern Mariana Islands", "1", 10, 10, [3, 3, 4]],
  ["MS", "Montserrat", "1", 10, 10, [3, 3, 4]],
  ["PR", "Puerto Rico", "1", 10, 10, [3, 3, 4]],
  ["SX", "Sint Maarten", "1", 10, 10, [3, 3, 4]],
  ["TC", "Turks and Caicos Islands", "1", 10, 10, [3, 3, 4]],
  ["TT", "Trinidad and Tobago", "1", 10, 10, [3, 3, 4]],
  ["VC", "Saint Vincent and the Grenadines", "1", 10, 10, [3, 3, 4]],
  ["VG", "British Virgin Islands", "1", 10, 10, [3, 3, 4]],
  ["VI", "U.S. Virgin Islands", "1", 10, 10, [3, 3, 4]],
  ["RU", "Russia", "7", 10, 10, [3, 3, 4]],
  ["KZ", "Kazakhstan", "7", 10, 10, [3, 3, 4]],
  ["GB", "United Kingdom", "44", 10, 10, [4, 6]],
  ["GG", "Guernsey", "44", 10, 10, [4, 6]],
  ["IM", "Isle of Man", "44", 10, 10, [4, 6]],
  ["JE", "Jersey", "44", 10, 10, [4, 6]],
  ["AF", "Afghanistan", "93", 9, 9, [2, 3, 4]],
  ["AL", "Albania", "355", 9, 9, [3, 3, 3]],
  ["DZ", "Algeria", "213", 9, 9, [3, 3, 3]],
  ["AD", "Andorra", "376", 6, 6, [3, 3]],
  ["AO", "Angola", "244", 9, 9, [3, 3, 3]],
  ["AR", "Argentina", "54", 10, 10, [3, 3, 4]],
  ["AM", "Armenia", "374", 8, 8, [2, 3, 3]],
  ["AW", "Aruba", "297", 7, 7, [3, 4]],
  ["AU", "Australia", "61", 9, 9, [3, 3, 3]],
  ["AT", "Austria", "43", 10, 13, [3, 7]],
  ["AZ", "Azerbaijan", "994", 9, 9, [2, 3, 4]],
  ["BH", "Bahrain", "973", 8, 8, [4, 4]],
  ["BD", "Bangladesh", "880", 10, 10, [4, 6]],
  ["BY", "Belarus", "375", 9, 9, [2, 3, 4]],
  ["BE", "Belgium", "32", 9, 9, [3, 3, 3]],
  ["BZ", "Belize", "501", 7, 7, [3, 4]],
  ["BJ", "Benin", "229", 8, 8, [2, 2, 2, 2]],
  ["BT", "Bhutan", "975", 8, 8, [2, 3, 3]],
  ["BO", "Bolivia", "591", 8, 8, [1, 3, 4]],
  ["BA", "Bosnia and Herzegovina", "387", 8, 8, [2, 3, 3]],
  ["BW", "Botswana", "267", 8, 8, [2, 3, 3]],
  ["BR", "Brazil", "55", 10, 11, [2, 5, 4]],
  ["BN", "Brunei", "673", 7, 7, [3, 4]],
  ["BG", "Bulgaria", "359", 8, 9, [2, 3, 3]],
  ["BF", "Burkina Faso", "226", 8, 8, [2, 2, 2, 2]],
  ["BI", "Burundi", "257", 8, 8, [2, 2, 2, 2]],
  ["KH", "Cambodia", "855", 8, 9, [2, 3, 3]],
  ["CM", "Cameroon", "237", 9, 9, [3, 3, 3]],
  ["CV", "Cape Verde", "238", 7, 7, [3, 4]],
  ["CF", "Central African Republic", "236", 8, 8, [2, 2, 2, 2]],
  ["TD", "Chad", "235", 8, 8, [2, 2, 2, 2]],
  ["CL", "Chile", "56", 9, 9, [1, 4, 4]],
  ["CN", "China", "86", 11, 11, [3, 4, 4]],
  ["CO", "Colombia", "57", 10, 10, [3, 3, 4]],
  ["KM", "Comoros", "269", 7, 7, [3, 4]],
  ["CG", "Congo", "242", 9, 9, [2, 3, 4]],
  ["CD", "Congo (DRC)", "243", 9, 9, [3, 3, 3]],
  ["CR", "Costa Rica", "506", 8, 8, [4, 4]],
  ["CI", "Côte d'Ivoire", "225", 10, 10, [2, 2, 2, 2, 2]],
  ["HR", "Croatia", "385", 8, 9, [2, 3, 3]],
  ["CU", "Cuba", "53", 8, 8, [1, 3, 4]],
  ["CW", "Curaçao", "599", 7, 7, [3, 4]],
  ["CY", "Cyprus", "357", 8, 8, [2, 3, 3]],
  ["CZ", "Czechia", "420", 9, 9, [3, 3, 3]],
  ["DK", "Denmark", "45", 8, 8, [2, 2, 2, 2]],
  ["DJ", "Djibouti", "253", 8, 8, [2, 2, 2, 2]],
  ["EC", "Ecuador", "593", 9, 9, [2, 3, 4]],
  ["EG", "Egypt", "20", 10, 10, [3, 3, 4]],
  ["SV", "El Salvador", "503", 8, 8, [4, 4]],
  ["GQ", "Equatorial Guinea", "240", 9, 9, [3, 3, 3]],
  ["ER", "Eritrea", "291", 7, 7, [1, 3, 3]],
  ["EE", "Estonia", "372", 7, 8, [4, 4]],
  ["SZ", "Eswatini", "268", 8, 8, [4, 4]],
  ["ET", "Ethiopia", "251", 9, 9, [2, 3, 4]],
  ["FK", "Falkland Islands", "500", 5, 5, [5]],
  ["FO", "Faroe Islands", "298", 6, 6, [3, 3]],
  ["FJ", "Fiji", "679", 7, 7, [3, 4]],
  ["FI", "Finland", "358", 9, 10, [2, 3, 4]],
  ["FR", "France", "33", 9, 9, [1, 2, 2, 2, 2]],
  ["GF", "French Guiana", "594", 9, 9, [3, 2, 2, 2]],
  ["PF", "French Polynesia", "689", 6, 8, [2, 2, 2]],
  ["GA", "Gabon", "241", 7, 8, [2, 2, 2, 2]],
  ["GM", "Gambia", "220", 7, 7, [3, 4]],
  ["GE", "Georgia", "995", 9, 9, [3, 3, 3]],
  ["DE", "Germany", "49", 10, 11, [3, 8]],
  ["GH", "Ghana", "233", 9, 9, [2, 3, 4]],
  ["GI", "Gibraltar", "350", 8, 8, [4, 4]],
  ["GR", "Greece", "30", 10, 10, [3, 3, 4]],
  ["GL", "Greenland", "299", 6, 6, [2, 2, 2]],
  ["GP", "Guadeloupe", "590", 9, 9, [3, 2, 2, 2]],
  ["GT", "Guatemala", "502", 8, 8, [4, 4]],
  ["GN", "Guinea", "224", 9, 9, [3, 3, 3]],
  ["GW", "Guinea-Bissau", "245", 7, 7, [3, 4]],
  ["GY", "Guyana", "592", 7, 7, [3, 4]],
  ["HT", "Haiti", "509", 8, 8, [2, 2, 4]],
  ["HN", "Honduras", "504", 8, 8, [4, 4]],
  ["HK", "Hong Kong", "852", 8, 8, [4, 4]],
  ["HU", "Hungary", "36", 9, 9, [2, 3, 4]],
  ["IS", "Iceland", "354", 7, 7, [3, 4]],
  ["IN", "India", "91", 10, 10, [5, 5]],
  ["ID", "Indonesia", "62", 9, 12, [3, 4, 4]],
  ["IR", "Iran", "98", 10, 10, [3, 3, 4]],
  ["IQ", "Iraq", "964", 10, 10, [3, 3, 4]],
  ["IE", "Ireland", "353", 9, 9, [2, 3, 4]],
  ["IL", "Israel", "972", 9, 9, [2, 3, 4]],
  ["IT", "Italy", "39", 9, 10, [3, 3, 4]],
  ["JP", "Japan", "81", 10, 10, [2, 4, 4]],
  ["JO", "Jordan", "962", 9, 9, [2, 3, 4]],
  ["KE", "Kenya", "254", 9, 9, [3, 3, 3]],
  ["KI", "Kiribati", "686", 5, 8, [4, 4]],
  ["XK", "Kosovo", "383", 8, 8, [2, 3, 3]],
  ["KW", "Kuwait", "965", 8, 8, [4, 4]],
  ["KG", "Kyrgyzstan", "996", 9, 9, [3, 3, 3]],
  ["LA", "Laos", "856", 8, 10, [2, 3, 3]],
  ["LV", "Latvia", "371", 8, 8, [2, 3, 3]],
  ["LB", "Lebanon", "961", 7, 8, [2, 3, 3]],
  ["LS", "Lesotho", "266", 8, 8, [4, 4]],
  ["LR", "Liberia", "231", 7, 8, [2, 3, 3]],
  ["LY", "Libya", "218", 9, 9, [2, 3, 4]],
  ["LI", "Liechtenstein", "423", 7, 7, [3, 4]],
  ["LT", "Lithuania", "370", 8, 8, [3, 5]],
  ["LU", "Luxembourg", "352", 9, 9, [3, 3, 3]],
  ["MO", "Macau", "853", 8, 8, [4, 4]],
  ["MG", "Madagascar", "261", 9, 9, [2, 2, 3, 2]],
  ["MW", "Malawi", "265", 9, 9, [3, 3, 3]],
  ["MY", "Malaysia", "60", 9, 10, [2, 3, 4]],
  ["MV", "Maldives", "960", 7, 7, [3, 4]],
  ["ML", "Mali", "223", 8, 8, [2, 2, 2, 2]],
  ["MT", "Malta", "356", 8, 8, [4, 4]],
  ["MH", "Marshall Islands", "692", 7, 7, [3, 4]],
  ["MQ", "Martinique", "596", 9, 9, [3, 2, 2, 2]],
  ["MR", "Mauritania", "222", 8, 8, [2, 2, 2, 2]],
  ["MU", "Mauritius", "230", 8, 8, [4, 4]],
  ["MX", "Mexico", "52", 10, 10, [2, 4, 4]],
  ["FM", "Micronesia", "691", 7, 7, [3, 4]],
  ["MD", "Moldova", "373", 8, 8, [2, 3, 3]],
  ["MC", "Monaco", "377", 8, 8, [2, 2, 2, 2]],
  ["MN", "Mongolia", "976", 8, 8, [4, 4]],
  ["ME", "Montenegro", "382", 8, 8, [2, 3, 3]],
  ["MA", "Morocco", "212", 9, 9, [2, 3, 4]],
  ["MZ", "Mozambique", "258", 9, 9, [2, 3, 4]],
  ["MM", "Myanmar", "95", 8, 10, [2, 3, 3]],
  ["NA", "Namibia", "264", 9, 9, [2, 3, 4]],
  ["NR", "Nauru", "674", 7, 7, [3, 4]],
  ["NP", "Nepal", "977", 10, 10, [3, 3, 4]],
  ["NL", "Netherlands", "31", 9, 9, [2, 3, 4]],
  ["NC", "New Caledonia", "687", 6, 6, [2, 2, 2]],
  ["NZ", "New Zealand", "64", 8, 10, [2, 3, 4]],
  ["NI", "Nicaragua", "505", 8, 8, [4, 4]],
  ["NE", "Niger", "227", 8, 8, [2, 2, 2, 2]],
  ["NG", "Nigeria", "234", 10, 10, [3, 3, 4]],
  ["KP", "North Korea", "850", 8, 10, [2, 3, 4]],
  ["MK", "North Macedonia", "389", 8, 8, [2, 3, 3]],
  ["NO", "Norway", "47", 8, 8, [3, 2, 3]],
  ["OM", "Oman", "968", 8, 8, [4, 4]],
  ["PS", "Palestine", "970", 9, 9, [2, 3, 4]],
  ["PA", "Panama", "507", 8, 8, [4, 4]],
  ["PG", "Papua New Guinea", "675", 8, 8, [3, 5]],
  ["PY", "Paraguay", "595", 9, 9, [3, 3, 3]],
  ["PE", "Peru", "51", 9, 9, [3, 3, 3]],
  ["PH", "Philippines", "63", 10, 10, [3, 3, 4]],
  ["PL", "Poland", "48", 9, 9, [3, 3, 3]],
  ["PT", "Portugal", "351", 9, 9, [3, 3, 3]],
  ["QA", "Qatar", "974", 8, 8, [4, 4]],
  ["RE", "Réunion", "262", 9, 9, [3, 2, 2, 2]],
  ["RO", "Romania", "40", 9, 9, [3, 3, 3]],
  ["RW", "Rwanda", "250", 9, 9, [3, 3, 3]],
  ["WS", "Samoa", "685", 5, 7, [3, 4]],
  ["SM", "San Marino", "378", 6, 10, [3, 3, 4]],
  ["ST", "São Tomé and Príncipe", "239", 7, 7, [3, 4]],
  ["SA", "Saudi Arabia", "966", 9, 9, [2, 3, 4]],
  ["SN", "Senegal", "221", 9, 9, [2, 3, 4]],
  ["RS", "Serbia", "381", 8, 9, [2, 3, 3]],
  ["SC", "Seychelles", "248", 7, 7, [3, 4]],
  ["SL", "Sierra Leone", "232", 8, 8, [2, 3, 3]],
  ["SG", "Singapore", "65", 8, 8, [4, 4]],
  ["SK", "Slovakia", "421", 9, 9, [3, 3, 3]],
  ["SI", "Slovenia", "386", 8, 8, [2, 3, 3]],
  ["SB", "Solomon Islands", "677", 5, 7, [3, 4]],
  ["SO", "Somalia", "252", 8, 8, [2, 3, 3]],
  ["ZA", "South Africa", "27", 9, 9, [2, 3, 4]],
  ["KR", "South Korea", "82", 9, 10, [2, 4, 4]],
  ["SS", "South Sudan", "211", 9, 9, [2, 3, 4]],
  ["ES", "Spain", "34", 9, 9, [3, 3, 3]],
  ["LK", "Sri Lanka", "94", 9, 9, [2, 3, 4]],
  ["SD", "Sudan", "249", 9, 9, [2, 3, 4]],
  ["SR", "Suriname", "597", 6, 7, [3, 4]],
  ["SE", "Sweden", "46", 9, 9, [2, 3, 4]],
  ["CH", "Switzerland", "41", 9, 9, [2, 3, 4]],
  ["SY", "Syria", "963", 9, 9, [2, 3, 4]],
  ["TW", "Taiwan", "886", 9, 9, [3, 3, 3]],
  ["TJ", "Tajikistan", "992", 9, 9, [2, 3, 4]],
  ["TZ", "Tanzania", "255", 9, 9, [3, 3, 3]],
  ["TH", "Thailand", "66", 9, 9, [2, 3, 4]],
  ["TL", "Timor-Leste", "670", 7, 8, [3, 4]],
  ["TG", "Togo", "228", 8, 8, [2, 2, 2, 2]],
  ["TO", "Tonga", "676", 5, 7, [3, 4]],
  ["TN", "Tunisia", "216", 8, 8, [2, 3, 3]],
  ["TR", "Turkey", "90", 10, 10, [3, 3, 4]],
  ["TM", "Turkmenistan", "993", 8, 8, [2, 3, 3]],
  ["TV", "Tuvalu", "688", 5, 6, [2, 4]],
  ["UG", "Uganda", "256", 9, 9, [3, 3, 3]],
  ["UA", "Ukraine", "380", 9, 9, [2, 3, 4]],
  ["AE", "United Arab Emirates", "971", 9, 9, [2, 3, 4]],
  ["UY", "Uruguay", "598", 8, 8, [2, 3, 3]],
  ["UZ", "Uzbekistan", "998", 9, 9, [2, 3, 4]],
  ["VU", "Vanuatu", "678", 5, 7, [3, 4]],
  ["VA", "Vatican City", "379", 8, 10, [3, 3, 4]],
  ["VE", "Venezuela", "58", 10, 10, [3, 3, 4]],
  ["VN", "Vietnam", "84", 9, 10, [3, 3, 3]],
  ["YE", "Yemen", "967", 9, 9, [3, 3, 3]],
  ["ZM", "Zambia", "260", 9, 9, [2, 3, 4]],
  ["ZW", "Zimbabwe", "263", 9, 9, [2, 3, 4]],
];

export const phoneCountries: PhoneCountry[] = rows.map((row) => country(...row));

const PK_PHONE = /^\d{4}-\d{7}$/;

export function phoneCountry(iso: string): PhoneCountry {
  return phoneCountries.find((entry) => entry.iso === iso) ?? phoneCountries[0]!;
}

export { groupPhoneDigits };

export function composePhone(country: PhoneCountry, raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (country.iso === "PK") {
    if (digits.startsWith("92") && digits.length > 11) digits = digits.slice(2);
    if (digits.length === 10 && digits.startsWith("3")) digits = `0${digits}`;
    digits = digits.slice(0, country.max);
    if (digits.length <= 4) return digits;
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith(country.dial) && digits.length > country.max) digits = digits.slice(country.dial.length);
  if (digits.startsWith("0")) digits = digits.replace(/^0+/, "");
  digits = digits.slice(0, country.max);
  if (!digits) return "";
  return `+${country.dial} ${groupPhoneDigits(digits, country.groups)}`;
}

export function parseStoredPhone(value: string, preferredIso = "PK"): { iso: string; national: string } {
  const text = value.trim();
  if (!text.startsWith("+")) return { iso: "PK", national: text };
  const digits = text.replace(/\D/g, "");
  const preferred = phoneCountry(preferredIso);
  const ranked = [...phoneCountries].filter((entry) => entry.iso !== "PK").sort((left, right) => {
    if (left.iso === preferred.iso) return -1;
    if (right.iso === preferred.iso) return 1;
    return right.dial.length - left.dial.length;
  });
  const match = ranked.find((entry) => digits.startsWith(entry.dial) && digits.length - entry.dial.length <= entry.max);
  if (!match) return { iso: preferredIso, national: "" };
  return { iso: match.iso, national: groupPhoneDigits(digits.slice(match.dial.length), match.groups) };
}

export function isCustomerPhone(value: string): boolean {
  const text = value.trim();
  if (PK_PHONE.test(text)) return true;
  if (!/^\+\d{1,4} [\d ]+$/.test(text) || text.includes("  ")) return false;
  const digits = text.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return false;
  const parsed = parseStoredPhone(text);
  const country = phoneCountry(parsed.iso);
  if (country.iso === "PK" || !parsed.national) return false;
  const national = text.slice(country.dial.length + 1).replace(/\D/g, "");
  return national.length >= country.min && national.length <= country.max;
}
