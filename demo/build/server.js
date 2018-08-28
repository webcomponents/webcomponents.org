"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const koa_1 = __importDefault(require("koa"));
const koa_compress_1 = __importDefault(require("koa-compress"));
class RawService {
    constructor() {
        this.app = new koa_1.default();
        this.port = process.env.PORT || 8080;
    }
    initalize() {
        return __awaiter(this, void 0, void 0, function* () {
            this.app.use(koa_compress_1.default());
            return this.app.listen(this.port, () => {
                console.log(`Listening on port ${this.port}`);
            });
        });
    }
}
exports.RawService = RawService;
if (!module.parent) {
    const raw = new RawService();
    raw.initalize();
}
