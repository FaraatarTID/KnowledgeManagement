import fs from 'fs';
import path from 'path';

export interface SystemConfig {
  categories: string[];
  departments: string[];
}

export class ConfigService {
  private readonly CONFIG_PATH = path.join(process.cwd(), 'data', 'system_config.json');
  private config: SystemConfig = {
    categories: ['Compliance', 'Engineering', 'HR', 'Marketing', 'Sales', 'General'],
    departments: ['IT', 'Engineering', 'Sales', 'Marketing', 'HR', 'Legal', 'General']
  };

  constructor() {
    this.init();
  }

  private init() {
    try {
      const dir = path.dirname(this.CONFIG_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(this.CONFIG_PATH)) {
        const data = fs.readFileSync(this.CONFIG_PATH, 'utf-8');
        this.config = { ...this.config, ...JSON.parse(data) };
      } else {
        this.save();
      }
    } catch (e) {
      console.error('ConfigService: Failed to initialize config', e);
    }
  }

  getConfig(): SystemConfig {
    return { ...this.config };
  }

  updateCategories(categories: string[]) {
    this.config.categories = Array.from(new Set(categories)).sort();
    this.save();
  }

  updateDepartments(departments: string[]) {
    this.config.departments = Array.from(new Set(departments)).sort();
    this.save();
  }

  private save() {
    try {
      fs.writeFileSync(this.CONFIG_PATH, JSON.stringify(this.config, null, 2));
    } catch (e) {
      console.error('ConfigService: Failed to save config', e);
    }
  }
}
