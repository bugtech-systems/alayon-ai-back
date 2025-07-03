import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DATASETS_DIR = path.join(__dirname, '../tuner/datasets');
export const MODELS_DIR = path.join(__dirname, '../tuner/models');
export const DEFAULT_PARAMS = {
    num_ctx: "4096",
    temperature: "0.7",
    top_p: "0.9",
    num_epoch: "3"
};