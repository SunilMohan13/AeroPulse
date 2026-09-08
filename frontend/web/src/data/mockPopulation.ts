import type { PopulationRiskArea, IndustrySite, Notification } from '../types'

export const mockRiskAreas: PopulationRiskArea[] = [
  { rank: 1, name: 'Delhi North', risk: 'HIGH', population: 890000, lat: 28.72, lon: 77.15 },
  { rank: 2, name: 'Ghaziabad', risk: 'HIGH', population: 620000, lat: 28.67, lon: 77.45 },
  { rank: 3, name: 'Sonipat', risk: 'MEDIUM', population: 380000, lat: 28.99, lon: 77.02 },
  { rank: 4, name: 'Panipat', risk: 'MEDIUM', population: 310000, lat: 29.39, lon: 76.97 },
  { rank: 5, name: 'Karnal', risk: 'LOW', population: 200000, lat: 29.69, lon: 76.99 },
]

export const mockIndustries: IndustrySite[] = [
  { id: 'ind_1', name: 'Panipat Refinery', lat: 29.42, lon: 76.95, type: 'Refinery' },
  { id: 'ind_2', name: 'Bhiwadi Industrial', lat: 28.21, lon: 76.86, type: 'Manufacturing' },
  { id: 'ind_3', name: 'Ludhiana Textile', lat: 30.9, lon: 75.85, type: 'Textile' },
]

export const mockNotifications: Notification[] = [
  {
    id: 'n1',
    title: 'High pollution event detected',
    message: 'Punjab agricultural burning — EVT-1024',
    time: '2 min ago',
    route: '/events/EVT-1024',
    icon: 'fire',
  },
  {
    id: 'n2',
    title: 'Forecast risk increased',
    message: 'Delhi NCR exposure projected to rise within 6h',
    time: '8 min ago',
    route: '/forecast',
    icon: 'forecast',
  },
  {
    id: 'n3',
    title: 'Sentinel-5P delayed',
    message: 'Satellite data delayed by 2h. Predictions continue.',
    time: '2 hr ago',
    route: '/sources',
    icon: 'warning',
  },
]
