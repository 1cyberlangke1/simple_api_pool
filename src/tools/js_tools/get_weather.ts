/**
 * 天气获取工具
 * @description 获取指定城市的天气信息，使用 Open-Meteo 免费 API
 * @module tools/js_tools/get_weather
 */

import type { JSONSchema7 } from "json-schema";

/**
 * 工具定义接口
 */
export interface JsToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema7;
  code: string;
  category: string;
  tags: string[];
}

/**
 * 天气获取工具定义
 */
export const GET_WEATHER_TOOL: JsToolDefinition = {
  name: "get_weather",
  description: "获取指定城市的天气信息，使用 Open-Meteo 免费 API",
  category: "网络",
  tags: ["天气", "网络", "API"],

  inputSchema: {
    type: "object",
    properties: {
      city: {
        type: "string",
        description: "城市名称（英文或中文，如: Beijing, 上海）",
      },
      latitude: {
        type: "number",
        description: "纬度（可选，直接指定坐标跳过城市搜索）",
      },
      longitude: {
        type: "number",
        description: "经度（可选，直接指定坐标跳过城市搜索）",
      },
    },
  },

  code: `// 天气获取工具
// 输入: city (城市名) 或 latitude/longitude (坐标)
// 输出: 天气信息

const { city, latitude, longitude } = args;

// 坐标缓存（常见城市）
var cityCoords = {
  'beijing': { lat: 39.9042, lon: 116.4074 },
  'shanghai': { lat: 31.2304, lon: 121.4737 },
  'guangzhou': { lat: 23.1291, lon: 113.2644 },
  'shenzhen': { lat: 22.5431, lon: 114.0579 },
  'hangzhou': { lat: 30.2741, lon: 120.1551 },
  'chengdu': { lat: 30.5728, lon: 104.0668 },
  '北京': { lat: 39.9042, lon: 116.4074 },
  '上海': { lat: 31.2304, lon: 121.4737 },
  '广州': { lat: 23.1291, lon: 113.2644 },
  '深圳': { lat: 22.5431, lon: 114.0579 },
  '杭州': { lat: 30.2741, lon: 120.1551 },
  '成都': { lat: 30.5728, lon: 104.0668 },
};

// 获取坐标
var lat, lon;

if (latitude !== undefined && longitude !== undefined) {
  // 直接使用提供的坐标
  lat = latitude;
  lon = longitude;
} else if (city) {
  // 尝试从缓存获取
  var cityLower = city.toLowerCase();
  var cached = cityCoords[cityLower] || cityCoords[city];
  
  if (cached) {
    lat = cached.lat;
    lon = cached.lon;
  } else {
    // 通过地理编码 API 搜索城市
    var geoUrl = 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(city) + '&count=1&language=zh&format=json';
    
    var geoResponse = await fetch(geoUrl);
    if (!geoResponse.ok) {
      throw new Error('城市搜索失败: ' + geoResponse.statusText);
    }
    
    var geoData = await geoResponse.json();
    
    if (!geoData.results || geoData.results.length === 0) {
      throw new Error('找不到城市: ' + city);
    }
    
    lat = geoData.results[0].latitude;
    lon = geoData.results[0].longitude;
  }
} else {
  throw new Error('请提供 city 或 latitude/longitude 参数');
}

// 获取天气数据
var weatherUrl = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto';

var weatherResponse = await fetch(weatherUrl);
if (!weatherResponse.ok) {
  throw new Error('天气获取失败: ' + weatherResponse.statusText);
}

var weatherData = await weatherResponse.json();

// 天气代码描述映射
var weatherCodes = {
  0: '晴朗',
  1: '大部晴朗', 2: '多云', 3: '阴天',
  45: '有雾', 48: '霜雾',
  51: '小毛毛雨', 53: '毛毛雨', 55: '大毛毛雨',
  61: '小雨', 63: '中雨', 65: '大雨',
  71: '小雪', 73: '中雪', 75: '大雪',
  80: '小阵雨', 81: '阵雨', 82: '大阵雨',
  95: '雷暴', 96: '雷暴伴小冰雹', 99: '雷暴伴大冰雹',
};

var current = weatherData.current;
var weatherCode = current.weather_code;

return {
  location: city || ('坐标 (' + lat + ', ' + lon + ')'),
  latitude: lat,
  longitude: lon,
  temperature: current.temperature_2m,
  temperatureUnit: (weatherData.current_units && weatherData.current_units.temperature_2m) || '°C',
  humidity: current.relative_humidity_2m,
  humidityUnit: '%',
  weatherCode: weatherCode,
  weatherDescription: weatherCodes[weatherCode] || '未知',
  windSpeed: current.wind_speed_10m,
  windSpeedUnit: (weatherData.current_units && weatherData.current_units.wind_speed_10m) || 'km/h',
  updateTime: new Date().toISOString(),
  source: 'Open-Meteo'
};`,
};

export default GET_WEATHER_TOOL;
