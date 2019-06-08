/// <reference path="phosphorus.ts" />
/// <reference path="utils.ts" />
/// <reference path="core.ts" />
/// <reference path="fonts.ts" />
/// <reference path="config.ts" />
/// <reference path="runtime.ts" />

// Scratch 3 project loader and runtime objects
namespace P.sb3 {
  // "Scratch3*" classes implement some part of the Scratch 3 runtime.
  // "SB3*" interfaces are just types for Scratch 3 projects

  /**
   * The path to fetch remote assets from.
   * Replace $md5ext with the md5sum and the format of the asset. (just use md5ext)
   */
  export const ASSETS_API = 'https://assets.scratch.mit.edu/internalapi/asset/$md5ext/get/';

  interface SB3Project {
    targets: SB3Target[];
    monitors: SB3Watcher[];
    meta: any;
  }

  export interface SB3Target {
    name: string;
    isStage: boolean;
    sounds: SB3Sound[];
    costumes: SB3Costume[];
    draggable: boolean;
    size: number;
    direction: number;
    visible: boolean;
    x: number;
    y: number;
    currentCostume: number;
    rotationStyle: string;
    layerOrder: number;
    lists: ObjectMap<SB3List>;
    variables: ObjectMap<SB3Variable>;
    blocks: ObjectMap<SB3Block>;
    broadcasts: ObjectMap<string>;
  }

  interface SB3Costume {
    /**
     * The ID of the asset. Should be its md5sum.
     * Example: "b61b1077b0ea1931abee9dbbfa7903ff"
     */
    assetId: string;
    name: string;
    /**
     * "Real pixels per image pixel"
     */
    bitmapResolution: number;
    /**
     * The ID of the asset with its extension.
     * Example: "b61b1077b0ea1931abee9dbbfa7903ff.png"
     */
    md5ext: string;
    /**
     * The format of the image.
     * Usually "png" or "svg"
     */
    dataFormat: string;
    rotationCenterX: number;
    rotationCenterY: number;
  }

  interface SB3Sound {
    assetId: string,
    name: string;
    dataFormat: string;
    format: string;
    rate: number;
    sampleCount: number;
    md5ext: string;
  }

  export interface SB3Block {
    opcode: string;
    topLevel: boolean;
    inputs: ObjectMap<any>;
    fields: ObjectMap<any>;
    mutation: any;
    parent: string | null;
    next: string | null;
  }

  interface SB3Watcher {
    spriteName: string | null;
    visible: boolean;
    id: string;
    opcode: string;
    mode: string;
    params: any;
    x: number;
    y: number;
    sliderMin?: number;
    sliderMax?: number;
    width?: number;
    height?: number;
    isDiscrete: boolean;
  }

  /**
   * Tuple of name and initial value
   */
  type SB3List = [string, any[]];

  /**
   * Tuple of name and initial value
   */
  type SB3Variable = [string, any];

  // Implements a Scratch 3 Stage.
  // Adds Scratch 3 specific things such as broadcastReferences
  export class Scratch3Stage extends P.core.Stage {
    public sb3data: SB3Target;

    createVariableWatcher(target: P.core.Base, variableName: string) {
      // TODO: implement
      return null;
    }
  }

  // Implements a Scratch 3 Sprite.
  export class Scratch3Sprite extends P.core.Sprite {
    public sb3data: any;

    _clone() {
      return new Scratch3Sprite(this.stage);
    }
  }

  export type Target = Scratch3Stage | Scratch3Sprite;

  // Implements a Scratch 3 VariableWatcher.
  // Adds Scratch 3-like styling
  export class Scratch3VariableWatcher extends P.core.Watcher {
    public id: string;
    public opcode: string;
    public mode: string;
    public params: any;
    public libraryEntry: P.sb3.compiler.WatchedValue;
    public sliderMin: number;
    public sliderMax: number;
    public sliderStep: number;

    public containerEl: HTMLElement;
    public valueEl: HTMLElement;

    constructor(stage: Scratch3Stage, data: SB3Watcher) {
      super(stage, data.spriteName || '');

      // Unique ID
      this.id = data.id;
      // Operation code, similar to other parts of Scratch 3
      this.opcode = data.opcode;
      this.mode = data.mode;
      // Watcher options, varies by opcode.
      this.params = data.params;
      // This opcode's watcherLibrary entry.
      this.libraryEntry = P.sb3.compiler.watcherLibrary[this.opcode];

      this.x = data.x;
      this.y = data.y;
      this.visible = typeof data.visible === 'boolean' ? data.visible : true;

      this.sliderMin = data.sliderMin || 0;
      this.sliderMax = data.sliderMax || 0;
      // isDiscrete doesn't always exist
      if (typeof data.isDiscrete !== 'undefined') {
        this.sliderStep = data.isDiscrete ? 1 : 0.01;
      } else {
        this.sliderStep = 1;
      }

      // Mark ourselves as invalid if the opcode is not recognized.
      if (!this.libraryEntry) {
        console.warn('unknown watcher', this.opcode, this);
        this.valid = false;
      }
    }

    update() {
      if (this.visible) {
        // Value is only updated when the value has changed to reduce useless paints in some browsers.
        const value = this.getValue();
        if (this.valueEl.textContent !== value) {
          this.valueEl.textContent = this.getValue();
        }
      }
    }

    init() {
      super.init();

      // call init() if it exists
      if (this.libraryEntry.init) {
        this.libraryEntry.init(this);
      }

      this.updateLayout();
    }

    setVisible(visible: boolean) {
      super.setVisible(visible);
      this.updateLayout();
    }

    // Gets the label of the watcher.
    // Will include the sprite's name if any.
    // Example results are 'Sprite1: my variable' and 'timer'
    getLabel() {
      const label = this.libraryEntry.getLabel(this);
      if (!this.target.isStage) {
        return this.targetName + ': ' + label;
      }
      return label;
    }

    // Gets the value of the watcher as a string.
    getValue() {
      const value = this.libraryEntry.evaluate(this);
      // Round off numbers to the 6th decimal
      if (typeof value === 'number') {
        return '' + (Math.round(value * 1e6) / 1e6);
      }
      return '' + value;
    }

    // Attempts to set the value of the watcher.
    // Will silently fail if this watcher cannot be set.
    setValue(value: number) {
      // Not all opcodes have a set()
      if (this.libraryEntry.set) {
        this.libraryEntry.set(this, value);
      }
    }

    // Updates or creates the layout of the watcher.
    updateLayout() {
      // If the HTML element has already been created, them simply update the CSS display property.
      if (this.containerEl) {
        this.containerEl.style.display = this.visible ? 'flex' : 'none';
        return;
      }

      if (!this.visible) {
        return;
      }

      const container = document.createElement('div');
      container.classList.add('s3-watcher-container');
      container.dataset.opcode = this.opcode;
      container.style.top = (this.y / 10) + 'em';
      container.style.left = (this.x / 10) + 'em';

      const value = document.createElement('div');
      value.classList.add('s3-watcher-value');
      value.textContent = this.getValue();

      this.containerEl = container;
      this.valueEl = value;
      this.stage.ui.appendChild(container);

      const mode = this.mode;

      if (mode === 'large') {
        container.classList.add('s3-watcher-large');
        container.appendChild(value);
      } else {
        // mode is probably 'normal' or 'slider'
        // if it's not, then 'normal' would be a good fallback anyways.

        const row = document.createElement('div');
        row.classList.add('s3-watcher-row');
        row.classList.add('s3-watcher-row-normal');

        const label = document.createElement('div');
        label.classList.add('s3-watcher-label');
        label.textContent = this.getLabel();

        row.appendChild(label);
        row.appendChild(value);

        container.classList.add('s3-watcher-container-normal');
        container.appendChild(row);

        // 'slider' is a slight variation of 'normal', just with an extra slider row.
        if (mode === 'slider') {
          const slider = document.createElement('div');
          slider.classList.add('s3-watcher-row-slider');

          const input = document.createElement('input');
          input.type = 'range';
          input.min = '' + this.sliderMin;
          input.max = '' + this.sliderMax;
          input.step = '' + this.sliderStep;
          input.value = this.getValue();
          input.addEventListener('input', this.sliderChanged.bind(this));

          slider.appendChild(input);
          container.appendChild(slider);
        }
      }
    }

    // Handles slider input events.
    sliderChanged(e: Event) {
      const value = +(e.target as HTMLInputElement).value;
      this.setValue(value);
    }
  }

  interface ListRow {
    row: HTMLElement;
    index: HTMLElement;
    value: HTMLElement;
  }

  export class Scratch3ListWatcher extends P.core.Watcher {
    private id: string;
    private params: any;
    private width: number;
    private height: number;
    private list: Scratch3List;
    private domRows: ListRow[] = [];
    private containerEl: HTMLElement;
    private topLabelEl: HTMLElement;
    private bottomLabelEl: HTMLElement;
    private contentEl: HTMLElement;

    constructor(stage: Scratch3Stage, data: SB3Watcher) {
      super(stage, data.spriteName || '');

      this.id = data.id;
      this.params = data.params;
      this.x = data.x;
      this.y = data.y;
      this.visible = typeof data.visible === 'boolean' ? data.visible : true;
      this.width = data.width || 100;
      this.height = data.height || 200;
    }

    update() {
      // We're not visible, so no changes would be seen. We'd only be wasting CPU cycles.
      // If the list was modified, we'll find out after we become visible.
      if (!this.visible) {
        return;
      }

      // Silently rest if the list has not been modified to improve performance for static lists.
      if (!this.list.modified) {
        return;
      }
      this.list.modified = false;
      this.updateContents();
    }

    updateContents() {
      const length = this.list.length;

      if (this.domRows.length < length) {
        while (this.domRows.length < length) {
          const row = this.createRow();
          this.domRows.push(row);
          this.contentEl.appendChild(row.row);
        }
      } else if (this.domRows.length > length) {
        while (this.domRows.length > length) {
          this.domRows.pop();
          this.contentEl.removeChild(this.contentEl.lastChild!);
        }
      }

      for (var i = 0; i < length; i++) {
        const { value } = this.domRows[i];
        const rowText = '' + this.list[i];
        if (rowText !== value.textContent) {
          value.textContent = rowText;
        }
      }

      const bottomLabelText = this.getBottomLabel();
      if (this.bottomLabelEl.textContent !== bottomLabelText) {
        this.bottomLabelEl.textContent = this.getBottomLabel();
      }
    }

    init() {
      super.init();
      if (!(this.id in this.target.lists)) {
        // Create the list if it doesn't exist.
        // It might be better to mark ourselves as invalid instead, but this works just fine.
        this.target.lists[this.id] = new Scratch3List();
      }
      this.list = this.target.lists[this.id] as Scratch3List;
      this.target.watchers[this.id] = this;
      this.updateLayout();
      if (this.visible) {
        this.updateContents();
      }
    }

    getTopLabel() {
      return this.params.LIST;
    }
    getBottomLabel() {
      return 'length ' + this.list.length;
    }

    updateLayout() {
      if (!this.containerEl) {
        this.createLayout();
      }
      this.containerEl.style.display = this.visible ? '' : 'none';
    }

    setVisible(visible: boolean) {
      super.setVisible(visible);
      this.updateLayout();
    }

    createRow(): ListRow {
      const row = document.createElement('div');
      const index = document.createElement('div');
      const value = document.createElement('div');
      row.classList.add('s3-list-row');
      index.classList.add('s3-list-index');
      value.classList.add('s3-list-value');
      index.textContent = (this.domRows.length + 1).toString();
      row.appendChild(index);
      row.appendChild(value);
      return { row, index, value };
    }

    createLayout() {
      this.containerEl = document.createElement('div');
      this.topLabelEl = document.createElement('div');
      this.bottomLabelEl = document.createElement('div');
      this.contentEl = document.createElement('div');

      this.containerEl.style.top = (this.y / 10) + 'em';
      this.containerEl.style.left = (this.x / 10) + 'em';
      this.containerEl.style.height = (this.height / 10) + 'em';
      this.containerEl.style.width = (this.width / 10) + 'em';
      this.containerEl.classList.add('s3-list-container');

      this.topLabelEl.textContent = this.getTopLabel();
      this.topLabelEl.classList.add('s3-list-top-label');

      this.bottomLabelEl.textContent = this.getBottomLabel();
      this.bottomLabelEl.classList.add('s3-list-bottom-label');

      this.contentEl.classList.add('s3-list-content');

      this.containerEl.appendChild(this.topLabelEl);
      this.containerEl.appendChild(this.contentEl);
      this.containerEl.appendChild(this.bottomLabelEl);
      this.stage.ui.appendChild(this.containerEl);
    }
  }

  // Implements a Scratch 3 procedure.
  // Scratch 3 uses names as references for arguments (Scratch 2 uses indexes I believe)
  export class Scratch3Procedure extends P.core.Procedure {
    call(inputs: any[]) {
      const args = {};
      for (var i = 0; i < this.inputs.length; i++) {
        args[this.inputs[i]] = inputs[i];
      }
      return args;
    }
  }

  // An Array usable by the Scratch 3 compiler.
  // Implements Scratch list blocks and their behavior.
  export class Scratch3List extends Array {
    public modified: boolean = false;

    // Modified toString() that functions like Scratch.
    toString() {
      var i = this.length;
      while (i--) {
        if (('' + this[i]).length !== 1) {
          return this.join(' ');
        }
      }
      return this.join('');
    }

    /**
     * Determines the "real" 0-indexed index of a 1-indexed Scratch index.
     * @param index A scratch 1-indexed index, or 'random', 'any', 'last'
     * @returns The 0-indexed index, or -1
     */
    scratchIndex(index: number | string): number {
      if (index === 'random' || index === 'any') {
        return Math.floor(Math.random() * this.length);
      }
      if (index === 'last') {
        return this.length - 1;
      }
      index = Math.floor(+index);
      if (index < 1 || index > this.length) {
        return -1;
      }
      return index - 1;
    }

    // Deletes a line from the list.
    // index is a scratch index.
    deleteLine(index: number | 'all') {
      if (index === 'all') {
        this.modified = true;
        this.length = 0;
        return;
      }

      index = this.scratchIndex(index);
      if (index === this.length - 1) {
        this.modified = true;
        this.pop();
      } else if (index !== -1) {
        this.modified = true;
        this.splice(index, 1);
      }
    }

    // Adds an item to the list.
    push(...items: any[]) {
      this.modified = true;
      return super.push(...items);
    }

    // Inserts an item at a spot in the list.
    // Index is a Scratch index.
    insert(index: number, value: any) {
      // TODO: simplify/refactor
      if (+index === 1) {
        this.modified = true;
        this.unshift(value);
        return;
      }
      index = this.scratchIndex(index);
      if (index === this.length) {
        this.modified = true;
        this.push(value);
      } else if (index !== -1) {
        this.modified = true;
        this.splice(index, 0, value);
      }
    }

    // Sets the index of something in the list.
    set(index: number, value: any) {
      index = this.scratchIndex(index);
      if (index !== -1) {
        this.modified = true;
        this[index] = value;
      }
    }
  }

  // Modifies a Scratch 3 SVG to work properly in our environment.
  function patchSVG(svg: SVGElement) {
    // SVGs made by Scratch 3 use font names such as 'Sans Serif', which we convert to their real names.
    const FONTS = {
      'Marker': 'Knewave',
      'Handwriting': 'Handlee',
      'Curly': 'Griffy',
      'Pixel': 'Pixel',
      'Scratch': 'Scratch',
      'Serif': 'Source Serif Pro',
      'Sans Serif': 'Noto Sans',
    };

    const textElements = svg.querySelectorAll('text');
    for (var i = 0; i < textElements.length; i++) {
      const el = textElements[i];
      const font = el.getAttribute('font-family') || '';
      if (FONTS[font]) {
        el.setAttribute('font-family', FONTS[font]);
      } else {
        console.warn('unknown font', font, '(defaulting to sans-serif)');
        // Scratch 3 replaces unknown fonts with sans serif.
        el.setAttribute('font-family', FONTS['Sans Serif']);
      }
    }

    // Special treatment for the viewBox attribute
    if (svg.hasAttribute('viewBox')) {
      // I think viewBox is supposed to be space separated, but Scratch sometimes make comma separated ones.
      const viewBox = svg.getAttribute('viewBox')!.split(/ |,/).map((i) => +i);
      if (viewBox.every((i) => !isNaN(i))) {
        const [ x, y, w, h ] = viewBox;
        // Fix width/height to include the viewBox min x/y
        svg.setAttribute('width', (w + x).toString());
        svg.setAttribute('height', (h + y).toString());
      } else {
        console.warn('weird viewBox', svg.getAttribute('viewBox'));
      }
      svg.removeAttribute('viewBox');
    }
  }

  // Implements base SB3 loading logic.
  // Needs to be extended to add file loading methods.
  // Implementations are expected to set `this.projectData` to something before calling super.load()
  export abstract class BaseSB3Loader {
    protected projectData: SB3Project;

    protected abstract getAsText(path: string): Promise<string>;
    protected abstract getAsArrayBuffer(path: string): Promise<ArrayBuffer>;
    protected abstract getAsImage(path: string, format: string): Promise<HTMLImageElement>;

    // Loads and returns a costume from its sb3 JSON data
    getImage(path: string, format: string): Promise<HTMLImageElement | HTMLCanvasElement> {
      if (format === 'svg') {
        return this.getAsText(path)
          .then((source) => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(source, 'image/svg+xml');
            const svg = doc.documentElement as any;
            patchSVG(svg);

            const canvas = document.createElement('canvas');

            return new Promise<HTMLCanvasElement | HTMLImageElement>((resolve, reject) => {
              canvg(canvas, new XMLSerializer().serializeToString(svg), {
                ignoreMouse: true,
                ignoreAnimation: true,
                ignoreClear: true,
                renderCallback: function() {
                  if (canvas.width === 0 || canvas.height === 0) {
                    resolve(new Image());
                    return;
                  }
                  resolve(canvas);
                }
              });
            });
          });
      } else {
        return this.getAsImage(path, format);
      }
    }

    loadCostume(data: SB3Costume, index: number): Promise<P.core.Costume> {
      const path = data.assetId + '.' + data.dataFormat;
      return this.getImage(path, data.dataFormat)
        .then((image) => new P.core.Costume({
          index: index,
          bitmapResolution: data.bitmapResolution,
          name: data.name,
          rotationCenterX: data.rotationCenterX,
          rotationCenterY: data.rotationCenterY,
          source: image,
        }));
    }

    getAudioBuffer(path: string) {
      return this.getAsArrayBuffer(path)
        .then((buffer) => P.audio.decodeAudio(buffer))
        .catch((err) => {
          throw new Error(`Could not load audio: ${path} (${err})`);
        });
    }

    loadSound(data: SB3Sound): Promise<P.core.Sound | null> {
      return new Promise((resolve, reject) => {
        this.getAudioBuffer(data.md5ext)
          .then((buffer) => {
            resolve(new P.core.Sound({
              name: data.name,
              buffer,
            }))
          })
          .catch((err) => {
            console.warn('Could not load sound: ' + err);
            resolve(null);
          });
      });
    }

    loadWatcher(data: SB3Watcher, stage: Scratch3Stage): P.core.Watcher {
      if (data.mode === 'list') {
        return new Scratch3ListWatcher(stage, data);
      }

      return new Scratch3VariableWatcher(stage, data);
    }

    loadTarget(data: SB3Target): Promise<Target> {
      // dirty hack for null stage
      const target = new (data.isStage ? Scratch3Stage : Scratch3Sprite)(null as any);

      for (const id of Object.keys(data.variables)) {
        const variable = data.variables[id];
        const name = variable[0];
        const value = variable[1];
        target.vars[name] = value;
      }

      for (const id of Object.keys(data.lists)) {
        const list = data.lists[id];
        const name = list[0];
        const content = list[1];
        target.lists[name] = new Scratch3List().concat(content);
      }

      target.name = data.name;
      target.currentCostumeIndex = data.currentCostume;
      target.sb3data = data;

      if (target.isStage) {

      } else {
        const sprite = target as Scratch3Sprite;
        sprite.scratchX = data.x;
        sprite.scratchY = data.y;
        sprite.visible = data.visible;
        sprite.direction = data.direction;
        sprite.scale = data.size / 100;
        sprite.isDraggable = data.draggable;
        sprite.rotationStyle = P.utils.parseRotationStyle(data.rotationStyle);
      }

      const costumesPromise = Promise.all<P.core.Costume>(data.costumes.map((c: any, i: any) => this.loadCostume(c, i)));
      const soundsPromise = Promise.all<P.core.Sound | null>(data.sounds.map((c) => this.loadSound(c)));

      return Promise.all<P.core.Costume[], Array<P.core.Sound | null>>([costumesPromise, soundsPromise])
        .then((result) => {
          const costumes = result[0];
          const sounds = result[1];

          target.costumes = costumes;
          sounds.forEach((sound) => sound && target.addSound(sound));

          return target;
        });
    }

    loadFonts(): Promise<void> {
      return P.fonts.loadScratch3();
    }

    load() {
      if (!this.projectData) {
        throw new Error('invalid project data');
      }
      if (!Array.isArray(this.projectData.targets)) {
        throw new Error('no targets');
      }

      const targets = this.projectData.targets;
      // sort targets by their layerOrder to match how they will display
      targets.sort((a, b) => a.layerOrder - b.layerOrder);

      return this.loadFonts()
        .then(() => Promise.all(targets.map((data) => this.loadTarget(data))))
        .then((targets: any) => {
          const stage = targets.filter((i) => i.isStage)[0] as Scratch3Stage;
          if (!stage) {
            throw new Error('no stage object');
          }
          const sprites = targets.filter((i) => i.isSprite) as Scratch3Sprite[];
          const watchers = this.projectData.monitors
            .map((data) => this.loadWatcher(data, stage))
            .filter((i) => i && i.valid);

          sprites.forEach((sprite) => sprite.stage = stage);
          targets.forEach((base) => new P.sb3.compiler2.Compiler(base).compile());
          stage.children = sprites;
          stage.allWatchers = watchers;
          watchers.forEach((watcher) => watcher.init());
          stage.updateBackdrop();

          return stage;
        });
    }
  }

  // Loads a .sb3 file
  export class SB3FileLoader extends BaseSB3Loader {
    private buffer: ArrayBuffer;
    private zip: JSZip.Zip;

    constructor(buffer: ArrayBuffer) {
      super();
      this.buffer = buffer;
    }

    getAsText(path: string) {
      P.IO.progressHooks.new();
      return this.zip.file(path).async('text')
        .then((response) => {
          P.IO.progressHooks.end();
          return response;
        });
    }

    getAsArrayBuffer(path: string) {
      P.IO.progressHooks.new();
      return this.zip.file(path).async('arrayBuffer')
        .then((response) => {
          P.IO.progressHooks.end();
          return response;
        });
    }

    getAsBase64(path: string) {
      P.IO.progressHooks.new();
      return this.zip.file(path).async('base64')
        .then((response) => {
          P.IO.progressHooks.end();
          return response;
        });
    }

    getAsImage(path: string, format: string) {
      P.IO.progressHooks.new();
      return this.getAsBase64(path)
        .then((imageData) => {
          return new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            image.onload = function() {
              P.IO.progressHooks.end();
              resolve(image);
            };
            image.onerror = function(error) {
              P.IO.progressHooks.error(error);
              reject('Failed to load image: ' + path + '.' + format);
            };
            image.src = 'data:image/' + format + ';base64,' + imageData;
          });
        });
    }

    load() {
      return JSZip.loadAsync(this.buffer)
        .then((data) => {
          this.zip = data;
          return this.getAsText('project.json');
        })
        .then((project) => {
          this.projectData = JSON.parse(project);
        })
        .then(() => super.load());
    }
  }

  // Loads a Scratch 3 project from the scratch.mit.edu website
  // Uses either a loaded project.json or its ID
  export class Scratch3Loader extends BaseSB3Loader {
    private projectId: number | null;

    constructor(idOrData: number | SB3Project) {
      super();
      if (typeof idOrData === 'object') {
        this.projectData = idOrData;
        this.projectId = null;
      } else {
        this.projectId = idOrData;
      }
    }

    getAsText(path: string) {
      return new P.IO.TextRequest(ASSETS_API.replace('$md5ext', path)).load();
    }

    getAsArrayBuffer(path: string) {
      return new P.IO.ArrayBufferRequest(ASSETS_API.replace('$md5ext', path)).load();
    }

    getAsImage(path: string) {
      P.IO.progressHooks.new();
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = function() {
          P.IO.progressHooks.end();
          resolve(image);
        };
        image.onerror = function(err) {
          P.IO.progressHooks.error(err);
          reject('Failed to load image: ' + image.src);
        };
        image.crossOrigin = 'anonymous';
        image.src = ASSETS_API.replace('$md5ext', path);
      });
    }

    load() {
      if (this.projectId) {
        return new P.IO.JSONRequest(P.config.PROJECT_API.replace('$id', '' + this.projectId)).load()
          .then((data) => {
            this.projectData = data;
            return super.load();
          });
      } else {
        return super.load();
      }
    }
  }
}

// Compiler for .sb3 projects
namespace P.sb3.compiler {
  // Source of the current script being compiled.
  let source: string;
  // The target being compiled.
  let currentTarget: P.sb3.Target;
  // The blocks of the target.
  let blocks: ObjectMap<Block>;
  // Points to the position of functions (by string index) within the compiled source.
  let fns: number[];

  // Alias Block so you don't have you type as much
  import Block = P.sb3.SB3Block;

  /*
  In Scratch 3 all blocks have a unique identifier.
  In the project.json, blocks do not contain other blocks in the way a .sb2 file does, but rather they point to the IDs of other blocks.

  This compiler differentiates between "statements", "expressions", "top levels", and "natives".
  Statements are things like `move [ ] steps`. They do something. Cannot be placed in other blocks.
  Expressions are things like `size`, `addition`, `and` etc. They return something. Cannot do anything on their own.
  Natives are things that are core parts of the runtime. This is stuff like strings, numbers, variable references, list references, colors.
  Top levels are top level blocks like `when green flag pressed`, they react to events.
  Each of these are separated and compiled differently and in different spots.
  */

  // A CompiledExpression is a type of expression made by an expression compiler with extra
  // data such as types for sake of optimization.
  class CompiledExpression {
    /**
     * The source code of this expression.
     */
    public source: string;

    /**
     * The type of this expression. Guarantees that, when evaluated, this expression will **always**
     * return a value of a certain type to avoid type coercion overhead.
     */
    public type: ExpressionType;

    constructor(src: string, type: ExpressionType) {
      this.source = src;
      this.type = type;
    }
  }

  // Easier aliases for CompiledExpression
  const numberExpr = (src: string) => new CompiledExpression(src, 'number');
  const stringExpr = (src: string) => new CompiledExpression(src, 'string');
  const booleanExpr = (src: string) => new CompiledExpression(src, 'boolean');

  // All possible types you can compile an expression into.
  type ExpressionType = 'string' | 'boolean' | 'number';

  // Compiler for a top level block
  export type TopLevelCompiler = (block: Block, f: P.runtime.Fn) => void;
  // Compiler for an expression
  export type ExpressionCompiler = (block: Block) => string | CompiledExpression;
  // Compiler for a statement
  export type StatementCompiler = (block: Block) => void;
  // Compiler/handler for a watcher
  export interface WatchedValue {
    /**
     * Initializes the watcher.
     */
    init?(watcher: P.sb3.Scratch3VariableWatcher): void;
    /**
     * Sets the value of the watcher to a new number.
     */
    set?(watcher: P.sb3.Scratch3VariableWatcher, value: number): void;
    /**
     * Evaluates the current value of the watcher. Called every visible frame.
     */
    evaluate(watcher: P.sb3.Scratch3VariableWatcher): any;
    /**
     * Determines the label to display in the watcher. Called once during initialization (after init)
     */
    getLabel(watcher: P.sb3.Scratch3VariableWatcher): string;
  }

  // IDs of primitive types
  // https://github.com/LLK/scratch-vm/blob/36fe6378db930deb835e7cd342a39c23bb54dd72/src/serialization/sb3.js#L60-L79
  const enum PrimitiveTypes {
    MATH_NUM = 4,
    POSITIVE_NUM = 5,
    WHOLE_NUM = 6,
    INTEGER_NUM = 7,
    ANGLE_NUM = 8,
    COLOR_PICKER = 9,
    TEXT = 10,
    BROADCAST = 11,
    VAR = 12,
    LIST = 13,
  }

  /**
   * Maps opcodes of top level blocks to their handler
   */
  export const topLevelLibrary: ObjectMap<TopLevelCompiler> = {
    // Events
    event_whenflagclicked(block, f) {
      currentTarget.listeners.whenGreenFlag.push(f);
    },
    event_whenkeypressed(block, f) {
      const key = block.fields.KEY_OPTION[0];
      if (key === 'any') {
        for (var i = 128; i--;) {
          currentTarget.listeners.whenKeyPressed[i].push(f);
        }
      } else {
        currentTarget.listeners.whenKeyPressed[P.runtime.getKeyCode(key)].push(f);
      }
    },
    event_whenthisspriteclicked(block, f) {
      currentTarget.listeners.whenClicked.push(f);
    },
    event_whenstageclicked(block, f) {
      currentTarget.listeners.whenClicked.push(f);
    },
    event_whenbackdropswitchesto(block, f) {
      const backdrop = block.fields.BACKDROP[0];
      if (!currentTarget.listeners.whenBackdropChanges[backdrop]) {
        currentTarget.listeners.whenBackdropChanges[backdrop] = [];
      }
      currentTarget.listeners.whenBackdropChanges[backdrop].push(f);
    },
    event_whenbroadcastreceived(block, f) {
      const name = block.fields.BROADCAST_OPTION[0].toLowerCase();
      if (!currentTarget.listeners.whenIReceive[name]) {
        currentTarget.listeners.whenIReceive[name] = [];
      }
      currentTarget.listeners.whenIReceive[name].push(f);
    },

    // Control
    control_start_as_clone(block, f) {
      currentTarget.listeners.whenCloned.push(f);
    },

    // Procedures
    procedures_definition(block, f) {
      const customBlockId = block.inputs.custom_block[1];
      const mutation = blocks[customBlockId].mutation;

      const proccode = mutation.proccode;
      // Warp is either a boolean or a string representation of that boolean for some reason.
      const warp = typeof mutation.warp === 'string' ? mutation.warp === 'true' : mutation.warp;
      // It's a stringified JSON array.
      const argumentNames = JSON.parse(mutation.argumentnames);

      const procedure = new P.sb3.Scratch3Procedure(f, warp, argumentNames);
      currentTarget.procedures[proccode] = procedure;
    },

    // Makey Makey (extension)
    makeymakey_whenMakeyKeyPressed(block, f) {
      const key = compileExpression(block.inputs.KEY);
      const keyMap = {
        // The key will be a full expression, including quotes around strings.
        '"SPACE"': 'space',
        '"UP"': 'up arrow',
        '"DOWN"': 'down arrow',
        '"LEFT"': 'left arrow',
        '"RIGHT"': 'right arrow',
        '"w"': 'w',
        '"a"': 'a',
        '"s"': 's',
        '"d"': 'd',
        '"f"': 'f',
        '"g"': 'g',
        // TODO: are other keys supported?
        // TODO: support non-compile-time constants
      };
      if (keyMap.hasOwnProperty(key)) {
        const keyCode = P.runtime.getKeyCode(keyMap[key]);
        currentTarget.listeners.whenKeyPressed[keyCode].push(f);
      } else {
        console.warn('unknown makey makey key', key);
      }
    },
  };

  // An untyped undefined works as it does in Scratch 3.
  // Becomes "undefined" when used as a string, becomes 0 when used as number, false when used as boolean.
  const noopExpression = () => 'undefined';

  /**
   * Maps expression opcodes to their handler
   */
  export const expressionLibrary: ObjectMap<ExpressionCompiler> = {
    // Motion
    motion_goto_menu(block) {
      const to = block.fields.TO[0];
      return sanitizedExpression(to);
    },
    motion_glideto_menu(block) {
      const to = block.fields.TO[0];
      return sanitizedExpression(to);
    },
    motion_pointtowards_menu(block) {
      const towards = block.fields.TOWARDS[0];
      return sanitizedExpression(towards);
    },
    motion_xposition(block) {
      return numberExpr('S.scratchX');
    },
    motion_yposition(block) {
      return numberExpr('S.scratchY');
    },
    motion_direction() {
      return numberExpr('S.direction');
    },

    // Looks
    looks_costume(block) {
      const costume = block.fields.COSTUME;
      return sanitizedExpression(costume[0]);
    },
    looks_backdrops(block) {
      const backdrop = block.fields.BACKDROP[0];
      return sanitizedExpression(backdrop);
    },
    looks_costumenumbername(block) {
      const name = block.fields.NUMBER_NAME[0];
      if (name === 'number') {
        return numberExpr('(S.currentCostumeIndex + 1)');
      } else {
        // `name` is probably 'name', but it doesn't matter
        return stringExpr('S.costumes[S.currentCostumeIndex].name');
      }
    },
    looks_backdropnumbername(block) {
      const name = block.fields.NUMBER_NAME[0];
      if (name === 'number') {
        return numberExpr('(self.currentCostumeIndex + 1)');
      } else {
        // `name` is probably 'name', but it doesn't matter
        return stringExpr('self.costumes[self.currentCostumeIndex].name');
      }
    },
    looks_size() {
      return numberExpr('(S.scale * 100)');
    },

    // Sounds
    sound_sounds_menu(block) {
      const sound = block.fields.SOUND_MENU[0];
      return sanitizedExpression(sound);
    },
    sound_volume() {
      return numberExpr('(S.volume * 100)');
    },

    // Control
    control_create_clone_of_menu(block) {
      const option = block.fields.CLONE_OPTION;
      return sanitizedExpression(option[0]);
    },
    control_get_counter(block) {
      return numberExpr('self.counter');
    },

    // Sensing
    sensing_touchingobject(block) {
      const object = block.inputs.TOUCHINGOBJECTMENU;
      return booleanExpr('S.touching(' + compileExpression(object) + ')');
    },
    sensing_touchingobjectmenu(block) {
      const object = block.fields.TOUCHINGOBJECTMENU;
      return sanitizedExpression(object[0]);
    },
    sensing_touchingcolor(block) {
      const color = block.inputs.COLOR;
      return booleanExpr('S.touchingColor(' + compileExpression(color) + ')');
    },
    sensing_coloristouchingcolor(block) {
      const color = block.inputs.COLOR;
      const color2 = block.inputs.COLOR2;
      return booleanExpr('S.colorTouchingColor(' + compileExpression(color) + ', ' + compileExpression(color2) + ')');
    },
    sensing_distanceto(block) {
      const menu = block.inputs.DISTANCETOMENU;
      return numberExpr('S.distanceTo(' + compileExpression(menu) + ')');
    },
    sensing_distancetomenu(block) {
      return sanitizedExpression(block.fields.DISTANCETOMENU[0]);
    },
    sensing_answer(block) {
      return stringExpr('self.answer');
    },
    sensing_keypressed(block) {
      const key = block.inputs.KEY_OPTION;
      return booleanExpr('!!self.keys[P.runtime.getKeyCode(' + compileExpression(key) + ')]');
    },
    sensing_keyoptions(block) {
      const key = block.fields.KEY_OPTION[0];
      return sanitizedExpression(key);
    },
    sensing_mousedown(block) {
      return booleanExpr('self.mousePressed');
    },
    sensing_mousex(block) {
      return numberExpr('self.mouseX');
    },
    sensing_mousey(block) {
      return numberExpr('self.mouseY');
    },
    sensing_loudness(block) {
      // We don't implement loudness, we always return -1 which indicates that there is no microphone available.
      return numberExpr('-1');
    },
    sensing_loud(block) {
      // see sensing_loudness above
      return booleanExpr('false');
    },
    sensing_timer(block) {
      if (P.config.preciseTimers) {
        return numberExpr('((runtime.rightNow() - runtime.timerStart) / 1000)');
      } else {
        return numberExpr('((runtime.now - runtime.timerStart) / 1000)');
      }
    },
    sensing_of(block) {
      const property = block.fields.PROPERTY[0];
      const object = block.inputs.OBJECT;
      return 'attribute(' + sanitizedString(property) + ', ' + compileExpression(object, 'string') + ')';
    },
    sensing_of_object_menu(block) {
      const object = block.fields.OBJECT[0];
      return sanitizedExpression(object);
    },
    sensing_current(block) {
      const current = block.fields.CURRENTMENU[0].toLowerCase();

      switch (current) {
        case 'year': return numberExpr('new Date().getFullYear()');
        case 'month': return numberExpr('(new Date().getMonth() + 1)');
        case 'date': return numberExpr('new Date().getDate()');
        case 'dayofweek': return numberExpr('(new Date().getDay() + 1)');
        case 'hour': return numberExpr('new Date().getHours()');
        case 'minute': return numberExpr('new Date().getMinutes()');
        case 'second': return numberExpr('new Date().getSeconds()');
      }

      return numberExpr('0');
    },
    sensing_dayssince2000(block) {
      return numberExpr('((Date.now() - epoch) / 86400000)');
    },
    sensing_username(block) {
      return stringExpr('self.username');
    },

    // Operators
    operator_add(block) {
      const num1 = block.inputs.NUM1;
      const num2 = block.inputs.NUM2;
      return numberExpr('(' + compileExpression(num1, 'number') + ' + ' + compileExpression(num2, 'number') + ' || 0)');
    },
    operator_subtract(block) {
      const num1 = block.inputs.NUM1;
      const num2 = block.inputs.NUM2;
      return numberExpr('(' + compileExpression(num1, 'number') + ' - ' + compileExpression(num2, 'number') + ' || 0)');
    },
    operator_multiply(block) {
      const num1 = block.inputs.NUM1;
      const num2 = block.inputs.NUM2;
      return numberExpr('(' + compileExpression(num1, 'number') + ' * ' + compileExpression(num2, 'number') + ' || 0)');
    },
    operator_divide(block) {
      const num1 = block.inputs.NUM1;
      const num2 = block.inputs.NUM2;
      return numberExpr('(' + compileExpression(num1, 'number') + ' / ' + compileExpression(num2, 'number') + ' || 0)');
    },
    operator_random(block) {
      const from = block.inputs.FROM;
      const to = block.inputs.TO;
      return numberExpr('random(' + compileExpression(from, 'number') + ', ' + compileExpression(to, 'number') + ')');
    },
    operator_gt(block) {
      const operand1 = block.inputs.OPERAND1;
      const operand2 = block.inputs.OPERAND2;
      // TODO: use numGreater?
      return booleanExpr('(compare(' + compileExpression(operand1) + ', ' + compileExpression(operand2) + ') === 1)');
    },
    operator_lt(block) {
      const operand1 = block.inputs.OPERAND1;
      const operand2 = block.inputs.OPERAND2;
      // TODO: use numLess?
      return booleanExpr('(compare(' + compileExpression(operand1) + ', ' + compileExpression(operand2) + ') === -1)');
    },
    operator_equals(block) {
      const operand1 = block.inputs.OPERAND1;
      const operand2 = block.inputs.OPERAND2;
      return booleanExpr('equal(' + compileExpression(operand1) + ', ' + compileExpression(operand2) + ')');
    },
    operator_and(block) {
      const operand1 = block.inputs.OPERAND1;
      const operand2 = block.inputs.OPERAND2;
      return booleanExpr('(' + compileExpression(operand1) + ' && ' + compileExpression(operand2) + ')');
    },
    operator_or(block) {
      const operand1 = block.inputs.OPERAND1;
      const operand2 = block.inputs.OPERAND2;
      return booleanExpr('(' + compileExpression(operand1) + ' || ' + compileExpression(operand2) + ')');
    },
    operator_not(block) {
      const operand = block.inputs.OPERAND;
      return booleanExpr('!' + compileExpression(operand));
    },
    operator_join(block) {
      const string1 = block.inputs.STRING1;
      const string2 = block.inputs.STRING2;
      return stringExpr('(' + compileExpression(string1, 'string') + ' + ' + compileExpression(string2, 'string') + ')');
    },
    operator_letter_of(block) {
      const string = block.inputs.STRING;
      const letter = block.inputs.LETTER;
      return stringExpr('((' + compileExpression(string, 'string') + ')[(' + compileExpression(letter, 'number') + ' | 0) - 1] || "")');
    },
    operator_length(block) {
      const string = block.inputs.STRING;
      // TODO: parenthesis important?
      return numberExpr('(' + compileExpression(string, 'string') + ').length');
    },
    operator_contains(block) {
      const string1 = block.inputs.STRING1;
      const string2 = block.inputs.STRING2;
      return booleanExpr(compileExpression(string1, 'string') + '.includes(' + compileExpression(string2, 'string') + ')');
    },
    operator_mod(block) {
      const num1 = block.inputs.NUM1;
      const num2 = block.inputs.NUM2;
      return numberExpr('mod(' + compileExpression(num1, 'number') + ', ' + compileExpression(num2, 'number') + ')');
    },
    operator_round(block) {
      const num = block.inputs.NUM;
      return numberExpr('Math.round(' + compileExpression(num, 'number') + ')');
    },
    operator_mathop(block) {
      const operator = block.fields.OPERATOR[0];
      const num = block.inputs.NUM;
      const compiledNum = compileExpression(num, 'number');

      switch (operator) {
        case 'abs':
          return numberExpr(`Math.abs(${compiledNum})`);
        case 'floor':
          return numberExpr(`Math.floor(${compiledNum})`);
        case 'sqrt':
          return numberExpr(`Math.sqrt(${compiledNum})`);
        case 'ceiling':
          return numberExpr(`Math.ceil(${compiledNum})`);
        case 'cos':
          return numberExpr(`Math.cos(${compiledNum} * Math.PI / 180)`);
        case 'sin':
          return numberExpr(`Math.sin(${compiledNum} * Math.PI / 180)`);
        case 'tan':
          return numberExpr(`Math.tan(${compiledNum} * Math.PI / 180)`);
        case 'asin':
          return numberExpr(`(Math.asin(${compiledNum}) * 180 / Math.PI)`)
        case 'acos':
          return numberExpr(`(Math.acos(${compiledNum}) * 180 / Math.PI)`)
        case 'atan':
          return numberExpr(`(Math.atan(${compiledNum}) * 180 / Math.PI)`)
        case 'ln':
          return numberExpr(`Math.log(${compiledNum})`);
        case 'log':
          return numberExpr(`(Math.log(${compiledNum}) / Math.LN10)`);
        case 'e ^':
          return numberExpr(`Math.exp(${compiledNum})`);
        case '10 ^':
          return numberExpr(`Math.exp(${compiledNum} * Math.LN10)`);
        default:
          return numberExpr('0');
      }
    },

    // Data
    data_itemoflist(block) {
      const list = block.fields.LIST[1];
      const index = block.inputs.INDEX;
      return 'getLineOfList(' + listReference(list) + ', ' + compileExpression(index) + ')';
    },
    data_itemnumoflist(block) {
      const list = block.fields.LIST[1];
      const item = block.inputs.ITEM;
      return numberExpr('listIndexOf(' + listReference(list) + ', ' + compileExpression(item) + ')');
    },
    data_lengthoflist(block) {
      const list = block.fields.LIST[1];
      return numberExpr(listReference(list) + '.length');
    },
    data_listcontainsitem(block) {
      const list = block.fields.LIST[1];
      const item = block.inputs.ITEM;
      return booleanExpr('listContains(' + listReference(list) + ', ' + compileExpression(item) + ')');
    },

    // Procedures/arguments
    argument_reporter_string_number(block) {
      const name = block.fields.VALUE[0];
      return 'C.args[' + sanitizedString(name) + ']';
    },
    argument_reporter_boolean(block) {
      const name = block.fields.VALUE[0];
      // Forcibly convert to boolean
      return booleanExpr(asType('C.args[' + sanitizedString(name) + ']', 'boolean'));
    },

    // The matrix, a little known expression. Only used in some of the robot extensions.
    matrix(block) {
      const matrix = block.fields.MATRIX[0];
      // This is a string, not a number. It's not to be treated as binary digits to convert to base 10.
      return sanitizedExpression(matrix);
    },

    // Pen (extension)
    pen_menu_colorParam(block) {
      const colorParam = block.fields.colorParam[0];
      return sanitizedExpression(colorParam);
    },

    // Music (extension)
    music_getTempo(block) {
      return numberExpr('self.tempoBPM');
    },

    // Makey Makey (extension)
    makeymakey_menu_KEY(block) {
      const key = block.fields.KEY[0];
      return sanitizedExpression(key);
    },

    // Legacy no-ops
    // https://github.com/LLK/scratch-vm/blob/bb42c0019c60f5d1947f3432038aa036a0fddca6/src/blocks/scratch3_sensing.js#L74
    sensing_userid: noopExpression,
    // https://github.com/LLK/scratch-vm/blob/bb42c0019c60f5d1947f3432038aa036a0fddca6/src/blocks/scratch3_motion.js#L42-L43
    motion_xscroll: noopExpression,
    motion_yscroll: noopExpression,
  };

  const noopStatement = () => { source += '/* noop */\n'};

  /**
   * Maps statement opcodes to their handler
   */
  export const statementLibrary: ObjectMap<StatementCompiler> = {
    // Motion
    motion_movesteps(block) {
      const steps = block.inputs.STEPS;
      source += 'S.forward(' + compileExpression(steps, 'number') + ');\n';
      visualCheck('drawing');
    },
    motion_turnright(block) {
      const degrees = block.inputs.DEGREES;
      source += 'S.setDirection(S.direction + ' + compileExpression(degrees, 'number') + ');\n';
      visualCheck('visible');
    },
    motion_turnleft(block) {
      const degrees = block.inputs.DEGREES;
      source += 'S.setDirection(S.direction - ' + compileExpression(degrees, 'number') + ');\n';
      visualCheck('visible');
    },
    motion_goto(block) {
      const to = block.inputs.TO;
      source += 'S.gotoObject(' + compileExpression(to) + ');\n';
      visualCheck('drawing');
    },
    motion_gotoxy(block) {
      const x = block.inputs.X;
      const y = block.inputs.Y;
      source += 'S.moveTo(' + compileExpression(x, 'number') + ', ' + compileExpression(y, 'number') + ');\n';
      visualCheck('drawing');
    },
    motion_glideto(block) {
      const secs = block.inputs.SECS;
      const to = block.inputs.TO;

      visualCheck('drawing');
      source += 'save();\n';
      source += 'R.start = runtime.now;\n';
      source += 'R.duration = ' + compileExpression(secs) + ';\n';
      source += 'R.baseX = S.scratchX;\n';
      source += 'R.baseY = S.scratchY;\n';
      source += 'var to = self.getPosition(' + compileExpression(to) + ');\n';
      source += 'if (to) {';
      source += '  R.deltaX = to.x - S.scratchX;\n';
      source += '  R.deltaY = to.y - S.scratchY;\n';
      const id = label();
      source += '  var f = (runtime.now - R.start) / (R.duration * 1000);\n';
      source += '  if (f > 1 || isNaN(f)) f = 1;\n';
      source += '  S.moveTo(R.baseX + f * R.deltaX, R.baseY + f * R.deltaY);\n';
      source += '  if (f < 1) {\n';
      forceQueue(id);
      source += '  }\n';
      source += '  restore();\n';
      source += '}\n';
    },
    motion_glidesecstoxy(block) {
      const secs = block.inputs.SECS;
      const x = block.inputs.X;
      const y = block.inputs.Y;

      visualCheck('drawing');
      source += 'save();\n';
      source += 'R.start = runtime.now;\n';
      source += 'R.duration = ' + compileExpression(secs) + ';\n';
      source += 'R.baseX = S.scratchX;\n';
      source += 'R.baseY = S.scratchY;\n';
      source += 'R.deltaX = ' + compileExpression(x) + ' - S.scratchX;\n';
      source += 'R.deltaY = ' + compileExpression(y) + ' - S.scratchY;\n';
      const id = label();
      source += 'var f = (runtime.now - R.start) / (R.duration * 1000);\n';
      source += 'if (f > 1) f = 1;\n';
      source += 'S.moveTo(R.baseX + f * R.deltaX, R.baseY + f * R.deltaY);\n';
      source += 'if (f < 1) {\n';
      forceQueue(id);
      source += '}\n';
      source += 'restore();\n';
    },
    motion_pointindirection(block) {
      const direction = block.inputs.DIRECTION;
      visualCheck('visible');
      source += 'S.direction = ' + compileExpression(direction) + ';\n';
    },
    motion_pointtowards(block) {
      const towards = block.inputs.TOWARDS;
      source += 'S.pointTowards(' + compileExpression(towards) + ');\n';
      visualCheck('visible');
    },
    motion_changexby(block) {
      const dx = block.inputs.DX;
      source += 'S.moveTo(S.scratchX + ' + compileExpression(dx, 'number') + ', S.scratchY);\n';
      visualCheck('drawing');
    },
    motion_setx(block) {
      const x = block.inputs.X;
      source += 'S.moveTo(' + compileExpression(x, 'number') + ', S.scratchY);\n';
      visualCheck('drawing');
    },
    motion_changeyby(block) {
      const dy = block.inputs.DY;
      source += 'S.moveTo(S.scratchX, S.scratchY + ' + compileExpression(dy, 'number') + ');\n';
      visualCheck('drawing');
    },
    motion_sety(block) {
      const y = block.inputs.Y;
      source += 'S.moveTo(S.scratchX, ' + compileExpression(y, 'number') + ');\n';
      visualCheck('drawing');
    },
    motion_ifonedgebounce(block) {
      // TODO: set visual if bounced
      source += 'S.bounceOffEdge();\n';
    },
    motion_setrotationstyle(block) {
      const style = block.fields.STYLE[0];
      source += 'S.rotationStyle = ' + P.utils.parseRotationStyle(style) + ';\n';
      visualCheck('visible');
    },

    // Looks
    looks_sayforsecs(block) {
      const message = block.inputs.MESSAGE;
      const secs = block.inputs.SECS;
      source += 'save();\n';
      source += 'R.id = S.say(' + compileExpression(message) + ', false);\n';
      source += 'R.start = runtime.now;\n';
      source += 'R.duration = ' + compileExpression(secs, 'number') + ';\n';
      const id = label();
      source += 'if (runtime.now - R.start < R.duration * 1000) {\n';
      forceQueue(id);
      source += '}\n';
      source += 'if (S.sayId === R.id) {\n';
      source += '  S.say("");\n';
      source += '}\n';
      source += 'restore();\n';
      visualCheck('visible');
    },
    looks_say(block) {
      const message = block.inputs.MESSAGE;
      source += 'S.say(' + compileExpression(message) + ', false);\n';
      visualCheck('visible');
    },
    looks_thinkforsecs(block) {
      const message = block.inputs.MESSAGE;
      const secs = block.inputs.SECS;
      source += 'save();\n';
      source += 'R.id = S.say(' + compileExpression(message) + ', true);\n';
      source += 'R.start = runtime.now;\n';
      source += 'R.duration = ' + compileExpression(secs, 'number') + ';\n';
      const id = label();
      source += 'if (runtime.now - R.start < R.duration * 1000) {\n';
      forceQueue(id);
      source += '}\n';
      source += 'if (S.sayId === R.id) {\n';
      source += '  S.say("");\n';
      source += '}\n';
      source += 'restore();\n';
      visualCheck('visible');
    },
    looks_think(block) {
      const message = block.inputs.MESSAGE;
      source += 'S.say(' + compileExpression(message) + ', true);\n';
      visualCheck('visible');
    },
    looks_switchcostumeto(block) {
      const costume = block.inputs.COSTUME;
      source += 'S.setCostume(' + compileExpression(costume) + ');\n';
      visualCheck('visible');
    },
    looks_nextcostume(block) {
      source += 'S.showNextCostume();\n';
      visualCheck('visible');
    },
    looks_switchbackdropto(block) {
      const backdrop = block.inputs.BACKDROP;
      source += 'self.setCostume(' + compileExpression(backdrop) + ');\n';
      visualCheck('always');
      source += 'var threads = backdropChange();\n';
      source += 'if (threads.indexOf(BASE) !== -1) {return;}\n';
    },
    looks_nextbackdrop(block) {
      source += 'self.showNextCostume();\n';
      visualCheck('always');
      source += 'var threads = backdropChange();\n';
      source += 'if (threads.indexOf(BASE) !== -1) {return;}\n';
    },
    looks_changesizeby(block) {
      const change = block.inputs.CHANGE;
      source += 'var f = S.scale + ' + compileExpression(change) + ' / 100;\n';
      source += 'S.scale = f < 0 ? 0 : f;\n';
      visualCheck('visible');
    },
    looks_setsizeto(block) {
      const size = block.inputs.SIZE;
      source += 'var f = ' + compileExpression(size) + ' / 100;\n';
      source += 'S.scale = f < 0 ? 0 : f;\n';
      visualCheck('visible');
    },
    looks_changeeffectby(block) {
      const effect = block.fields.EFFECT[0];
      const change = block.inputs.CHANGE;
      source += 'S.changeFilter(' + sanitizedString(effect).toLowerCase() + ', ' + compileExpression(change, 'number') + ');\n';
      visualCheck('visible');
    },
    looks_seteffectto(block) {
      const effect = block.fields.EFFECT[0];
      const value = block.inputs.VALUE;
      // Lowercase conversion is necessary to remove capitals, which we do not want.
      source += 'S.setFilter(' + sanitizedString(effect).toLowerCase() + ', ' + compileExpression(value, 'number') + ');\n';
      visualCheck('visible');
    },
    looks_cleargraphiceffects(block) {
      source += 'S.resetFilters();\n';
      visualCheck('visible');
    },
    looks_show(block) {
      source += 'S.visible = true;\n';
      visualCheck('always');
      updateBubble();
    },
    looks_hide(block) {
      visualCheck('visible');
      source += 'S.visible = false;\n';
      updateBubble();
    },
    looks_gotofrontback(block) {
      const frontBack = block.fields.FRONT_BACK[0];
      source += 'var i = self.children.indexOf(S);\n';
      source += 'if (i !== -1) self.children.splice(i, 1);\n';
      if (frontBack === 'front') {
        source += 'self.children.push(S);\n';
      } else {
        // `frontBack` is probably 'back', but it doesn't matter
        source += 'self.children.unshift(S);\n';
      }
    },
    looks_goforwardbackwardlayers(block) {
      const direction = block.fields.FORWARD_BACKWARD[0];
      const number = block.inputs.NUM;
      source += 'var i = self.children.indexOf(S);\n';
      source += 'if (i !== -1) {\n';
      source += '  self.children.splice(i, 1);\n';
      if (direction === 'forward') {
        source += '  self.children.splice(Math.min(self.children.length - 1, i + ' + compileExpression(number) + '), 0, S);\n';
      } else {
        // `direction` is probably 'backward', but it doesn't matter
        source += '  self.children.splice(Math.max(0, i - ' + compileExpression(number) + '), 0, S);\n';
      }
      source += '}\n';
    },

    // Sounds
    sound_playuntildone(block) {
      const sound = block.inputs.SOUND_MENU;
      source += 'var sound = S.getSound(' + compileExpression(sound) + ');\n';
      source += 'if (sound) {\n';
      source += '  playSound(sound);\n';
      wait('sound.duration');
      source += '}\n';
    },
    sound_play(block) {
      const sound = block.inputs.SOUND_MENU;
      source += 'var sound = S.getSound(' + compileExpression(sound) + ');\n';
      source += 'if (sound) {\n';
      source += '  playSound(sound);\n';
      source += '}\n';
    },
    sound_stopallsounds(block) {
      if (P.audio.context) {
        source += 'self.stopAllSounds();\n';
      }
    },
    sound_changevolumeby(block) {
      const volume = block.inputs.VOLUME;
      source += 'S.volume = Math.max(0, Math.min(1, S.volume + ' + compileExpression(volume, 'number') + ' / 100));\n';
      source += 'if (S.node) S.node.gain.setValueAtTime(S.volume, audioContext.currentTime);\n';
      source += 'for (var sounds = S.sounds, i = sounds.length; i--;) {\n';
      source += '  var sound = sounds[i];\n';
      source += '  if (sound.node && sound.target === S) {\n';
      source += '    sound.node.gain.setValueAtTime(S.volume, audioContext.currentTime);\n';
      source += '  }\n';
      source += '}\n';
    },
    sound_setvolumeto(block) {
      const volume = block.inputs.VOLUME;
      source += 'S.volume = Math.max(0, Math.min(1, ' + compileExpression(volume, 'number') + ' / 100));\n';
      source += 'if (S.node) S.node.gain.setValueAtTime(S.volume, audioContext.currentTime);\n';
      source += 'for (var sounds = S.sounds, i = sounds.length; i--;) {\n';
      source += '  var sound = sounds[i];\n';
      source += '  if (sound.node && sound.target === S) {\n';
      source += '    sound.node.gain.setValueAtTime(S.volume, audioContext.currentTime);\n';
      source += '  }\n';
      source += '}\n';
    },

    // Event
    event_broadcast(block) {
      const input = block.inputs.BROADCAST_INPUT;
      source += 'var threads = broadcast(' + compileExpression(input) + ');\n';
      source += 'if (threads.indexOf(BASE) !== -1) {return;}\n';
    },
    event_broadcastandwait(block) {
      const input = block.inputs.BROADCAST_INPUT;
      source += 'save();\n';
      source += 'R.threads = broadcast(' + compileExpression(input) + ');\n';
      source += 'if (R.threads.indexOf(BASE) !== -1) {return;}\n';
      const id = label();
      source += 'if (running(R.threads)) {\n';
      forceQueue(id);
      source += '}\n';
      source += 'restore();\n';
    },

    // Control
    control_wait(block) {
      const duration = block.inputs.DURATION;
      source += 'save();\n';
      source += 'R.start = runtime.now;\n';
      source += 'R.duration = ' + compileExpression(duration) + ';\n';
      source += 'var first = true;\n';
      const id = label();
      source += 'if (runtime.now - R.start < R.duration * 1000 || first) {\n';
      source += '  var first;\n';
      forceQueue(id);
      source += '}\n';
      source += 'restore();\n';
    },
    control_repeat(block) {
      const times = block.inputs.TIMES;
      const substack = block.inputs.SUBSTACK;
      source += 'save();\n';
      source += 'R.count = ' + compileExpression(times) + ';\n';
      const id = label();
      source += 'if (R.count >= 0.5) {\n';
      source += '  R.count -= 1;\n';
      compileSubstack(substack);
      queue(id);
      source += '} else {\n';
      source += '  restore();\n';
      source += '}\n';
    },
    control_forever(block) {
      const substack = block.inputs.SUBSTACK;
      const id = label();
      compileSubstack(substack);
      queue(id);
    },
    control_if(block) {
      const condition = block.inputs.CONDITION;
      const substack = block.inputs.SUBSTACK;
      source += 'if (' + compileExpression(condition) + ') {\n';
      compileSubstack(substack);
      source += '}\n';
    },
    control_if_else(block) {
      const condition = block.inputs.CONDITION;
      const substack1 = block.inputs.SUBSTACK;
      const substack2 = block.inputs.SUBSTACK2;
      source += 'if (' + compileExpression(condition) + ') {\n';
      compileSubstack(substack1);
      source += '} else {\n';
      compileSubstack(substack2);
      source += '}\n';
    },
    control_wait_until(block) {
      const condition = block.inputs.CONDITION;
      const id = label();
      source += 'if (!' + compileExpression(condition) + ') {\n';
      forceQueue(id);
      source += '}\n';
    },
    control_repeat_until(block) {
      const condition = block.inputs.CONDITION;
      const substack = block.inputs.SUBSTACK;
      const id = label();
      source += 'if (!' + compileExpression(condition, 'boolean') + ') {\n';
      compileSubstack(substack);
      queue(id);
      source += '}\n';
    },
    control_while(block) {
      // Hacked block
      const condition = block.inputs.CONDITION;
      const substack = block.inputs.SUBSTACK;
      const id = label();
      source += 'if (' + compileExpression(condition, 'boolean') + ') {\n';
      compileSubstack(substack);
      queue(id);
      source += '}\n';
    },
    control_all_at_once(block) {
      // https://github.com/LLK/scratch-vm/blob/bb42c0019c60f5d1947f3432038aa036a0fddca6/src/blocks/scratch3_control.js#L194-L199
      const substack = block.inputs.SUBSTACK;
      compileSubstack(substack);
    },
    control_stop(block) {
      const option = block.fields.STOP_OPTION[0];

      switch (option) {
        case 'all':
          source += 'runtime.stopAll();\n';
          source += 'return;\n';
          break;
        case 'this script':
          source += 'endCall();\n';
          source += 'return;\n';
          break;
        case 'other scripts in sprite':
        case 'other scripts in stage':
          source += 'for (var i = 0; i < runtime.queue.length; i++) {\n';
          source += '  if (i !== THREAD && runtime.queue[i] && runtime.queue[i].sprite === S) {\n';
          source += '    runtime.queue[i] = undefined;\n';
          source += '  }\n';
          source += '}\n';
          break;
        default:
          // If the field is not recognized or not a compile-time constant, then fallback to a large switch statement.
          source += 'switch (' + sanitizedString(option) + ') {\n';
          source += '  case "all":\n';
          source += '    runtime.stopAll();\n';
          source += '    return;\n';
          source += '  case "this script":\n';
          source += '    endCall();\n';
          source += '    return;\n';
          source += '  case "other scripts in sprite":\n';
          source += '  case "other scripts in stage":\n';
          source += '    for (var i = 0; i < runtime.queue.length; i++) {\n';
          source += '      if (i !== THREAD && runtime.queue[i] && runtime.queue[i].sprite === S) {\n';
          source += '        runtime.queue[i] = undefined;\n';
          source += '      }\n';
          source += '    }\n';
          source += '    break;\n';
          source += '}\n';
      }
    },
    control_create_clone_of(block) {
      const option = block.inputs.CLONE_OPTION;
      source += 'clone(' + compileExpression(option) + ');\n';
    },
    control_delete_this_clone(block) {
      source += 'if (S.isClone) {\n';
      source += '  S.remove();\n';
      source += '  var i = self.children.indexOf(S);\n';
      source += '  if (i !== -1) self.children.splice(i, 1);\n';
      source += '  for (var i = 0; i < runtime.queue.length; i++) {\n';
      source += '    if (runtime.queue[i] && runtime.queue[i].sprite === S) {\n';
      source += '      runtime.queue[i] = undefined;\n';
      source += '    }\n';
      source += '  }\n';
      source += '  return;\n';
      source += '}\n';
    },
    control_incr_counter(block) {
      source += 'self.counter++;\n';
    },
    control_clear_counter(block) {
      source += 'self.counter = 0;\n';
    },

    // Sensing
    sensing_askandwait(block) {
      const question = block.inputs.QUESTION;
      source += 'R.id = self.nextPromptId++;\n';
      // 1 - wait until we are next up for the asking
      const id1 = label();
      source += 'if (self.promptId < R.id) {\n';
      forceQueue(id1);
      source += '}\n';

      source += 'S.ask(' + compileExpression(question, 'string') + ');\n';
      // 2 - wait until the prompt has been answered
      const id2 = label();
      source += 'if (self.promptId === R.id) {\n';
      forceQueue(id2);
      source += '}\n';

      visualCheck('always');
    },
    sensing_setdragmode(block) {
      const dragMode = block.fields.DRAG_MODE[0];
      if (dragMode === 'draggable') {
        source += 'S.isDraggable = true;\n';
      } else {
        // it doesn't matter what `dragMode` is at this point
        source += 'S.isDraggable = false;\n';
      }
    },
    sensing_resettimer(blocK) {
      source += 'runtime.timerStart = runtime.now;\n';
    },

    // Data
    data_setvariableto(block) {
      const variableId = block.fields.VARIABLE[1];
      const value = block.inputs.VALUE;
      source += variableReference(variableId) + ' = ' + compileExpression(value) + ';\n';
    },
    data_changevariableby(block) {
      const variableId = block.fields.VARIABLE[1];
      const value = block.inputs.VALUE;
      const ref = variableReference(variableId);
      source += ref + ' = (' + asType(ref, 'number') + ' + ' + compileExpression(value, 'number') + ');\n';
    },
    data_showvariable(block) {
      const variable = block.fields.VARIABLE[1];
      const scope = variableScope(variable);
      source += scope + '.showVariable(' + sanitizedString(variable) + ', true);\n';
    },
    data_hidevariable(block) {
      const variable = block.fields.VARIABLE[1];
      const scope = variableScope(variable);
      source += scope + '.showVariable(' + sanitizedString(variable) + ', false);\n';
    },
    data_showlist(block) {
      const list = block.fields.LIST[1];
      const scope = listScope(list);
      source += scope + '.showVariable(' + sanitizedString(list) + ', true);\n';
    },
    data_hidelist(block) {
      const list = block.fields.LIST[1];
      const scope = listScope(list);
      source += scope + '.showVariable(' + sanitizedString(list) + ', false);\n';
    },
    data_addtolist(block) {
      const list = block.fields.LIST[1];
      const item = block.inputs.ITEM;
      source += listReference(list) + '.push(' + compileExpression(item)  + ');\n';
    },
    data_deleteoflist(block) {
      const list = block.fields.LIST[1];
      const index = block.inputs.INDEX;
      source += listReference(list) + '.deleteLine(' + compileExpression(index) + ');\n';
    },
    data_deletealloflist(block) {
      const list = block.fields.LIST[1];
      source += listReference(list) + '.deleteLine("all");\n';
    },
    data_insertatlist(block) {
      const list = block.fields.LIST[1];
      const item = block.inputs.ITEM;
      const index = block.inputs.INDEX;
      source += listReference(list) + '.insert(' + compileExpression(index) + ', ' + compileExpression(item) + ');\n';
    },
    data_replaceitemoflist(block) {
      const list = block.fields.LIST[1];
      const item = block.inputs.ITEM;
      const index = block.inputs.INDEX;
      source += listReference(list) + '.set(' + compileExpression(index) + ', ' + compileExpression(item) + ');\n';
    },

    // Procedures
    procedures_call(block) {
      const mutation = block.mutation;
      const name = mutation.proccode;

      if (P.config.debug && name === 'forkphorus:debugger;') {
        source += '/* forkphorus debugger */debugger;\n';
        return;
      }

      const id = nextLabel();
      source += 'call(S.procedures[' + sanitizedString(name) + '], ' + id + ', [\n';

      // The mutation has a stringified JSON list of input IDs... it's weird.
      const inputIds = JSON.parse(mutation.argumentids);
      for (const id of inputIds) {
        const input = block.inputs[id];
        source += '  ' + compileExpression(input) + ',\n';
      }

      source += ']);\n';

      delay();
    },

    // Pen (extension)
    pen_clear(block) {
      source += 'self.clearPen();\n';
      visualCheck('always');
    },
    pen_stamp(block) {
      source += 'S.stamp();\n';
      visualCheck('always');
    },
    pen_penDown(block) {
      source += 'S.isPenDown = true;\n';
      source += 'S.dotPen();\n';
      visualCheck('always');
    },
    pen_penUp(block) {
      // TODO: determine visualCheck variant
      // definitely not 'always' or 'visible', might be a 'if (S.isPenDown)'
      source += 'S.isPenDown = false;\n';
    },
    pen_setPenColorToColor(block) {
      const color = block.inputs.COLOR;
      source += 'S.setPenColor(' + compileExpression(color, 'number') + ');\n';
    },
    pen_setPenHueToNumber(block) {
      const hue = block.inputs.HUE;
      source += 'S.setPenColorHSL();\n';
      source += 'S.penHue = ' + compileExpression(hue, 'number') + ' * 360 / 200;\n';
      source += 'S.penSaturation = 100;\n';
    },
    pen_changePenHueBy(block) {
      const hue = block.inputs.HUE;
      source += 'S.setPenColorHSL();\n';
      source += 'S.penHue += ' + compileExpression(hue, 'number') + ' * 360 / 200;\n';
      source += 'S.penSaturation = 100;\n';
    },
    pen_setPenShadeToNumber(block) {
      const shade = block.inputs.SHADE;
      source += 'S.setPenColorHSL();\n';
      source += 'S.penLightness = ' + compileExpression(shade, 'number') + ' % 200;\n';
      source += 'if (S.penLightness < 0) S.penLightness += 200;\n';
      source += 'S.penSaturation = 100;\n';
    },
    pen_changePenShadeBy(block) {
      const shade = block.inputs.SHADE;
      source += 'S.setPenColorHSL();\n';
      source += 'S.penLightness = (S.penLightness + ' + compileExpression(shade, 'number') + ') % 200;\n';
      source += 'if (S.penLightness < 0) S.penLightness += 200;\n';
      source += 'S.penSaturation = 100;\n';
    },
    pen_setPenColorParamTo(block) {
      const colorParam = block.inputs.COLOR_PARAM;
      const value = block.inputs.VALUE;
      source += 'S.setPenColorParam(' + compileExpression(colorParam, 'string') + ', ' + compileExpression(value, 'number') + ');\n';
    },
    pen_changePenColorParamBy(block) {
      const colorParam = block.inputs.COLOR_PARAM;
      const value = block.inputs.VALUE;
      source += 'S.changePenColorParam(' + compileExpression(colorParam, 'string') + ', ' + compileExpression(value, 'number') + ');\n';
    },
    pen_changePenSizeBy(block) {
      const size = block.inputs.SIZE;
      source += 'S.penSize = Math.max(1, S.penSize + ' + compileExpression(size, 'number') + ');\n';
    },
    pen_setPenSizeTo(block) {
      const size = block.inputs.SIZE;
      source += 'S.penSize = Math.max(1, ' + compileExpression(size, 'number') + ');\n';
    },

    // Music (extension)
    music_setTempo(block) {
      const tempo = block.inputs.TEMPO;
      source += 'self.tempoBPM = ' + compileExpression(tempo, 'number') + ';\n';
    },
    music_changeTempo(block) {
      const tempo = block.inputs.TEMPO;
      source += 'self.tempoBPM += ' + compileExpression(tempo, 'number') + ';\n';
    },

    // Legacy no-ops.
    // https://github.com/LLK/scratch-vm/blob/bb42c0019c60f5d1947f3432038aa036a0fddca6/src/blocks/scratch3_motion.js#L19
    motion_scroll_right: noopStatement,
    motion_scroll_up: noopStatement,
    motion_align_scene: noopStatement,
    // https://github.com/LLK/scratch-vm/blob/bb42c0019c60f5d1947f3432038aa036a0fddca6/src/blocks/scratch3_looks.js#L248
    looks_changestretchby: noopStatement,
    looks_setstretchto: noopStatement,
    looks_hideallsprites: noopStatement,
  };

  // Contains data used for variable watchers.
  export const watcherLibrary: ObjectMap<WatchedValue> = {
    // Maps watcher opcode to the methods that define its behavior.

    // Motion
    motion_xposition: {
      evaluate(watcher) { return watcher.target.scratchX; },
      getLabel() { return 'x position'; },
    },
    motion_yposition: {
      evaluate(watcher) { return watcher.target.scratchY; },
      getLabel() { return 'y position'; },
    },
    motion_direction: {
      evaluate(watcher) { return P.core.isSprite(watcher.target) ? watcher.target.direction : 0; },
      getLabel() { return 'direction'; },
    },

    // Looks
    looks_costumenumbername: {
      evaluate(watcher) {
        const target = watcher.target;
        const param = watcher.params.NUMBER_NAME;
        if (param === 'number') {
          return target.currentCostumeIndex + 1;
        } else {
          return target.costumes[target.currentCostumeIndex].name;
        }
      },
      getLabel(watcher) {
        return 'costume ' + watcher.params.NUMBER_NAME;
      },
    },
    looks_backdropnumbername: {
      evaluate(watcher) {
        const target = watcher.stage;
        const param = watcher.params.NUMBER_NAME;
        if (param === 'number') {
          return target.currentCostumeIndex + 1;
        } else {
          return target.costumes[target.currentCostumeIndex].name;
        }
      },
      getLabel(watcher) {
        return 'backdrop ' + watcher.params.NUMBER_NAME;
      },
    },
    looks_size: {
      evaluate(watcher) { return P.core.isSprite(watcher.target) ? watcher.target.scale * 100 : 100; },
      getLabel() { return 'size'; },
    },

    // Sound
    sound_volume: {
      evaluate(watcher) { return watcher.target.volume * 100; },
      getLabel() { return 'volume'; },
    },

    // Sensing
    sensing_answer: {
      evaluate(watcher) { return watcher.stage.answer; },
      getLabel() { return 'answer'; },
    },
    sensing_loudness: {
      // We don't implement loudness.
      evaluate() { return -1; },
      getLabel() { return 'loudness'; },
    },
    sensing_timer: {
      evaluate(watcher) {
        return (watcher.stage.runtime.now - watcher.stage.runtime.timerStart) / 1000;
      },
      getLabel() { return 'timer'; },
    },
    sensing_current: {
      evaluate(watcher) {
        const param = watcher.params.CURRENTMENU.toLowerCase();
        switch (param) {
          case 'year': return new Date().getFullYear();
          case 'month': return new Date().getMonth() + 1;
          case 'date': return new Date().getDate();
          case 'dayofweek': return new Date().getDay() + 1;
          case 'hour': return new Date().getHours();
          case 'minute': return new Date().getMinutes();
          case 'second': return new Date().getSeconds();
        }
        return 0;
      },
      getLabel(watcher) {
        const param = watcher.params.CURRENTMENU.toLowerCase();
        // all expected params except DAYOFWEEK can just be lowercased and used directly
        if (param === 'dayofweek') {
          return 'day of week';
        }
        return param;
      }
    },
    sensing_username: {
      evaluate(watcher) { return watcher.stage.username; },
      getLabel() { return 'username'; },
    },

    // Data
    data_variable: {
      init(watcher) {
        const name = watcher.params.VARIABLE;
        watcher.target.watchers[name] = watcher;
      },
      set(watcher, value) {
        const name = watcher.params.VARIABLE;
        watcher.target.vars[name] = value;
      },
      evaluate(watcher) {
        const name = watcher.params.VARIABLE;
        return watcher.target.vars[name];
      },
      getLabel(watcher) {
        return watcher.params.VARIABLE;
      },
    },

    // Music (extension)
    music_getTempo: {
      evaluate(watcher) { return watcher.stage.tempoBPM; },
      getLabel() { return 'Music: tempo'; },
    },
  };

  ///
  /// Helpers
  ///

  /**
   * Adds JS to update the speech bubble if necessary
   */
  function updateBubble() {
    source += 'if (S.saying) S.updateBubble();\n';
  }

  /**
   * Adds JS to enable the VISUAL runtime flag when necessary
   * @param variant 'drawing', 'visible', or 'always'
   */
  function visualCheck(variant: 'drawing' | 'visible' | 'always') {
    if (P.config.debug) {
      source += '/*visual:' + variant + '*/';
    }
    switch (variant) {
      case 'drawing': source += 'if (S.visible || S.isPenDown) VISUAL = true;\n'; break;
      case 'visible': source += 'if (S.visible) VISUAL = true;\n'; break;
      case 'always':  source += 'VISUAL = true;\n'; break;
    }
  }

  // Queues something to run with the forceQueue runtime method
  function forceQueue(id: number) {
    source += 'forceQueue(' + id + '); return;\n';
  }

  // Queues something to run with the queue runtime method
  function queue(id: number) {
    source += 'queue(' + id + '); return;\n';
  }

  // Adds a delay
  function delay() {
    source += 'return;\n';
    label();
  }

  // Gets the next label
  function nextLabel(): number {
    return fns.length + currentTarget.fns.length;
  }

  // Creates and returns a new label for the script's current state
  function label(): number {
    const id = nextLabel();
    fns.push(source.length);
    if (P.config.debug) {
      source += '/*label:' + id + '*/';
    }
    return id;
  }

  // Sanitizes a string to be used in a javascript string enclosed in double quotes.
  function sanitizedString(thing: string): string {
    if (typeof thing !== 'string') {
      thing = '' + thing;
    }
    return '"' + thing
      .replace(/\\/g, '\\\\')
      .replace(/'/g, '\\\'')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\{/g, '\\x7b')
      .replace(/\}/g, '\\x7d') + '"';
  }

  // Sanitizes a string using sanitizedString() as a compiled string expression.
  function sanitizedExpression(thing: string): CompiledExpression {
    return stringExpr(sanitizedString(thing));
  }

  // Adds JS to wait for a duration.
  // `duration` is a valid compiled JS expression.
  function wait(duration: string) {
    source += 'save();\n';
    source += 'R.start = runtime.now;\n';
    source += 'R.duration = ' + duration + ';\n';
    source += 'var first = true;\n';
    const id = label();
    source += 'if (runtime.now - R.start < R.duration * 1000 || first) {\n';
    source += '  var first;\n';
    forceQueue(id);
    source += '}\n';
    source += 'restore();\n';
  }

  /**
   * Determines the runtime object that owns a variable.
   * If the variable does not exist, it will be created.
   * @param id The Scratch 3 variable ID
   */
  function variableScope(id: string) {
    if (id in currentTarget.stage.vars) {
      return 'self';
    } else if (id in currentTarget.vars) {
      return 'S';
    } else {
      // We make sure all variables exist at compile time.
      // We'll use 0 as a default value because I **think** this is what Scratch 3 does.
      currentTarget.vars[id] = 0;
      return 'S';
    }
  }

  /**
   * Determines the runtime object that owns a list.
   * If the list does not exist, it will be created.
   * @param id The Scratch 3 list ID
   */
  function listScope(id: string) {
    if (id in currentTarget.stage.lists) {
      return 'self';
    } else if (id in currentTarget.lists) {
      return 'S';
    } else {
      // We make sure all lists exist at compile time.
      // Unknown lists become empty lists. This is probably what Scratch 3 does.
      currentTarget.lists[id] = new Scratch3List();
      return 'S';
    }
  }

  // Returns a reference to a variable with an ID
  function variableReference(id: string) {
    const scope = variableScope(id);
    return scope + '.vars[' + compileExpression(id) + ']';
  }

  // Returns a reference to a list with a ID
  function listReference(id: string) {
    const scope = listScope(id);
    return scope + '.lists[' + compileExpression(id) + ']';
  }

  ///
  /// Compilers
  ///

  // Compiles a '#ABCDEF' color
  function compileColor(hexCode: string): CompiledExpression {
    // Remove the leading # and use it to create a hexadecimal number
    const hex = hexCode.substr(1);
    // Ensure that it is actually a hex number.
    if (/^[0-9a-f]{6}$/.test(hex)) {
      return numberExpr('0x' + hex);
    } else {
      console.warn('expected hex color code but got', hex);
      return numberExpr('0x0');
    }
  }

  // Compiles a native expression (number, string, data) to a JavaScript string
  function compileNative(constant): CompiledExpression | string {
    // Natives are arrays, where the first value is the type ID. (see PrimitiveTypes)
    const type = constant[0];

    switch (type) {
      // These all function as numbers. I believe they are only differentiated so the editor can be more helpful.
      case PrimitiveTypes.MATH_NUM:
      case PrimitiveTypes.POSITIVE_NUM:
      case PrimitiveTypes.WHOLE_NUM:
      case PrimitiveTypes.INTEGER_NUM:
      case PrimitiveTypes.ANGLE_NUM: {
        const number = parseFloat(constant[1]);
        if (!isNaN(number)) {
          return numberExpr(number.toString());
        } else {
          return sanitizedExpression(constant[1]);
        }
      }

      case PrimitiveTypes.TEXT:
        return sanitizedExpression(constant[1]);

      case PrimitiveTypes.VAR:
        // For variable natives the second item is the name of the variable
        // and the third is the ID of the variable. We only care about the ID.
        return variableReference(constant[2]);

      case PrimitiveTypes.LIST:
        // Similar to variable references
        return listReference(constant[2]);

      case PrimitiveTypes.BROADCAST:
        // [type, name, id]
        return compileExpression(constant[1]);

      case PrimitiveTypes.COLOR_PICKER:
        // Colors are stored as strings like "#123ABC", so we must do some conversions to use them as numbers.
        return compileColor(constant[1]);

      default:
        console.warn('unknown constant', type, constant);
        return stringExpr('""');
    }
  }

  /**
   * Compiles a block
   * The source code is in the source variable (does not return)
   */
  function compile(block: Block | string) {
    if (typeof block === 'string') {
      block = blocks[block];
    }
    if (!block) {
      return;
    }

    while (true) {
      const opcode = block.opcode;
      const compiler = statementLibrary[opcode];
      if (!compiler) {
        console.warn('unknown statement', opcode, block);
      } else {
        if (P.config.debug) {
          source += '/*' + opcode + '*/';
        }
        compiler(block);
      }

      if (!block.next) {
        break;
      }
      block = blocks[block.next];
    }
  }

  // Compiles a substack (script inside of another block)
  function compileSubstack(substack) {
    // Substacks are statements inside of statements.
    // Substacks are a type of input. The first item is type ID, the second is the ID of the child.

    // Substacks are not guaranteed to exist, so silently fail.
    if (!substack) {
      return;
    }

    // TODO: check type?
    // const type = substack[0];

    const id: string = substack[1];
    compile(id);
  }

  function asType(script: string | CompiledExpression, type?: ExpressionType): string {
    if (script instanceof CompiledExpression) {
      // If a compiled expression is already of the desired type, then simply return it.
      if (script.type === type) {
        return script.source;
      }
      script = script.source;
    }
    switch (type) {
      case 'string': return '("" + ' + script + ')';
      case 'number': return '+' + script;
      case 'boolean': return 'bool(' + script + ')';
    }
    return script;
  }

  function fallbackValue(type?: ExpressionType): string {
    switch (type) {
      case 'string': return '""';
      case 'number': return '0';
      case 'boolean': return 'false';
    }
    return '""';
  }

  /**
   * Compiles a Scratch 3 expression or input.
   *
   * @param The expression to compile
   * @param The requested type of the expression
   * @return The source of the compiled expression with any required type conversions
   */
  function compileExpression(expression, type?: ExpressionType): string {
    if (!expression) {
      return fallbackValue(type);
    }

    // TODO: use asType?
    if (typeof expression === 'string') {
      return sanitizedString(expression);
    }
    if (typeof expression === 'number') {
      // I have a slight feeling this block never runs.
      // TODO: remove?
      return '' + expression;
    }

    if (Array.isArray(expression[1])) {
      const native = expression[1];
      return asType(compileNative(native), type);
    }

    const id = expression[1];
    const block = blocks[id];
    if (!block) {
      return fallbackValue(type);
    }
    const opcode = block.opcode;

    const compiler = expressionLibrary[opcode];
    if (!compiler) {
      console.warn('unknown expression', opcode, block);
      return fallbackValue(type);
    }
    let result = compiler(block);

    if (result instanceof CompiledExpression) {
      if (P.config.debug) {
        result.source = '/*' + opcode + '*/' + result.source;
      }
      return asType(result, type);
    }

    if (P.config.debug) {
      result = '/*' + opcode + '*/' + result;
    }

    return asType(result, type);
  }

  /**
   * Compiles a top block listener from the top down.
   * The resulting source code is in the `source` variable of P.sb3.compiler
   * @returns {boolean} Successful compiling
   */
  function compileListener(topBlock: Block): boolean {
    // Ignore blocks where we don't recognize the opcode
    const topLevelOpCode = topBlock.opcode;
    if (!(topLevelOpCode in topLevelLibrary)) {
      // Only log warnings if we wouldn't otherwise recognize the block.
      // Some dangling non-top-level blocks is very common.
      if (!(topLevelOpCode in expressionLibrary) && !(topLevelOpCode in statementLibrary)) {
        console.warn('unknown top level block', topLevelOpCode, topBlock);
      }
      return false;
    }

    // We can completely ignore empty listeners (those without any children)
    if (!topBlock.next) {
      return false;
    }

    source = '';
    const block = blocks[topBlock.next];

    compile(block);

    // Procedure definitions need special care to properly end calls.
    // In the future this should be refactored so that things like this are part of the top level library
    if (topLevelOpCode === 'procedures_definition') {
      source += 'endCall(); return;\n';
    }

    return true;
  }

  /**
   * Compiles a Scratch 3 Target (Sprite/Stage)
   *
   * @param target The constructed instance of P.sb3.Target
   * @param data The raw sb3 data of the target
   */
  export function compileTarget(target: P.sb3.Target, data: P.sb3.SB3Target) {
    currentTarget = target;
    blocks = data.blocks;

    // We compile blocks from the top level down to their children, so extract top level blocks
    const topLevelBlocks = Object.keys(data.blocks)
      .map((id) => data.blocks[id])
      .filter((block) => block.topLevel);

    for (const block of topLevelBlocks) {
      // The first function points to the very start at index 0
      fns = [0];

      const compilingSuccess = compileListener(block);
      if (!compilingSuccess) {
        continue;
      }

      const startFn = target.fns.length;
      for (var i = 0; i < fns.length; i++) {
        target.fns.push(P.runtime.createContinuation(source.slice(fns[i])));
      }

      const topLevelHandler = topLevelLibrary[block.opcode];
      topLevelHandler(block, target.fns[startFn]);

      if (P.config.debug) {
        console.log('compiled sb3 script', block.opcode, source, target);
      }
    }
  }

  /**
   * External hooks
   */
  export const hooks = {
    getSource() {
      return source;
    },
    setSource(src: string) {
      source = src;
    },
    appendSource(src: string) {
      source += src;
    },
    expression(expression) {
      return compileExpression(expression);
    },
  };
}

namespace P.sb3.compiler2 {
  import Fn = P.runtime.Fn;

  /**
   * Asserts at compile-time that a value is of the type `never`
   */
  function assertNever(i: never): never {
    throw new Error('assertion failed');
  }

  // IDs of native types
  // https://github.com/LLK/scratch-vm/blob/36fe6378db930deb835e7cd342a39c23bb54dd72/src/serialization/sb3.js#L60-L79
  const enum NativeTypes {
    MATH_NUM = 4,
    POSITIVE_NUM = 5,
    WHOLE_NUM = 6,
    INTEGER_NUM = 7,
    ANGLE_NUM = 8,
    COLOR_PICKER = 9,
    TEXT = 10,
    BROADCAST = 11,
    VAR = 12,
    LIST = 13,
  }

  export class CompiledInput {
    constructor(public source: string, public type: InputType) {

    }
  }

  // Simple CompiledInput aliases
  const stringInput = (v: string) => new CompiledInput(v, 'string');
  const numberInput = (v: string) => new CompiledInput(v, 'number');
  const booleanInput = (v: string) => new CompiledInput(v, 'boolean');
  const anyInput = (v: string) => new CompiledInput(v, 'any');

  /**
   * A compiler for a statement.
   * A statement is something like "move ( ) steps"
   * @param util Use the methods of the utility class to write the body.
   */
  export type StatementCompiler = (util: StatementUtil) => void

  /**
   * A compiler for an input.
   * An input is something like the "10" in "move (10) steps"
   */
  export type InputCompiler = (util: InputUtil) => CompiledInput;

  /**
   * A compiler for a hat block.
   */
  export interface HatCompiler {
    /**
     * The handler that is responsible for installing the compiled functions
     */
    handle(util: HatUtil): void;
    /**
     * Optionally make last minute changes to the script's source.
     * The result of this will replace the script before compilation.
     */
    preprocess?(compiler: Compiler, source: string): string;
  };

  export type InputType = 'string' | 'boolean' | 'number' | 'any';

  /**
   * General block generation utilities.
   */
  export class BlockUtil {
    constructor(public compiler: Compiler, public block: SB3Block) {

    }

    /**
     * Compile an input, and give it a type.
     */
    getInput(name: string, type: InputType): string {
      return this.compiler.compileInput(this.block, name, type);
    }

    /**
     * Compile a field. Results are unescaped strings and unsafe to include in a script.
     */
    getField(name: string): string {
      return this.compiler.getField(this.block, name);
    }

    /**
     * Get and sanitize a field.
     */
    fieldInput(name: string): CompiledInput {
      return this.sanitizedInput(this.getField(name));
    }

    /**
     * Sanitize an unescaped string into an input.
     */
    sanitizedInput(string: string): CompiledInput {
      return this.compiler.sanitizedInput(string);
    }

    /**
     * Sanitize an unescaped string for inclusion in a script.
     */
    sanitizedString(string: string): string {
      return this.compiler.sanitizedString(string);
    }

    /**
     * Gets a field's reference to a variable.
     */
    getVariableReference(field: string): string {
      return this.compiler.getVariableReference(this.getField(field));
    }

    /**
     * Gets a field's reference to a list.
     */
    getListReference(field: string): string {
      return this.compiler.getListReference(this.getField(field));
    }

    /**
     * Gets the scope of a field's reference to a variable.
     */
    getVariableScope(field: string): string {
      return this.compiler.getVariableScope(this.getField(field));
    }

    /**
     * Gets the scope of a field's reference to a list.
     */
    getListScope(field: string): string {
      return this.compiler.getListScope(this.getField(field));
    }

    /**
     * Forcibly converts JS to another type.
     */
    asType(input: string, type: InputType): string {
      return this.compiler.asType(input, type)
    }
  }

  /**
   * General statement generation utilities.
   */
  export class StatementUtil extends BlockUtil {
    public content: string = '';

    /**
     * Compile a substack.
     */
    getSubstack(name: string): string {
      return this.compiler.compileSubstackInput(this.block, name);
    }

    /**
     * Gets the next label available for use without claiming it.
     */
    nextLabel(): number {
      return this.compiler.labelCount;
    }

    /**
     * Create a new label at this location.
     */
    addLabel(): number {
      const label = this.nextLabel();
      this.compiler.labelCount++;
      // We'll use special syntax to denote this spot as a label.
      // It'll be cleaned up later in compilation.
      // Interestingly, this is actually valid JavaScript, so cleanup isn't strictly necessary.
      this.write(`{{${label}}}`);
      return label;
    }

    /**
     * Writes the queue() method to call a label.
     */
    queue(label: number): void {
      this.writeLn(`queue(${label}); return;`);
    }

    /**
     * Writes the forceQueue() method to call a label.
     */
    forceQueue(label: number): void {
      this.writeLn(`forceQueue(${label}); return;`);
    }

    /**
     * Writes an appropriate VISUAL check
     */
    visual(variant: 'drawing' | 'visible' | 'always'): void {
      switch (variant) {
        case 'drawing': this.writeLn('if (S.visible || S.isPenDown) VISUAL = true;'); break;
        case 'visible': this.writeLn('if (S.visible) VISUAL = true;'); break;
        case 'always': this.writeLn('VISUAL = true;'); break;
        default: assertNever(variant);
      }
    }

    /**
     * Update the speech bubble, if any.
     */
    updateBubble() {
      this.writeLn('if (S.saying) S.updateBubble()');
    }

    /**
     * Writes JS to pause the script for a duration
     */
    wait(duration: string) {
      this.writeLn('save();');
      this.writeLn('R.start = runtime.now;');
      this.writeLn(`R.duration = ${duration}`);
      this.writeLn('var first = true;');
      const label = this.addLabel();
      this.writeLn('if (runtime.now - R.start < R.duration * 1000 || first) {');
      this.writeLn('  var first;');
      this.forceQueue(label);
      this.writeLn('}');
      this.writeLn('restore();');
    }

    /**
     * Append to the content
     */
    write(content: string): void {
      this.content += content;
    }

    /**
     * Append to the content, followed by a newline.
     */
    writeLn(content: string): void {
      this.content += content + '\n';
    }
  }

  /**
   * General input generation utilities.
   */
  export class InputUtil extends BlockUtil {
    numberInput(v: string) { return numberInput(v); }
    stringInput(v: string) { return stringInput(v); }
    booleanInput(v: string) { return booleanInput(v); }
    anyInput(v: string) { return anyInput(v); }
  }

  /**
   * General hat handling utilities.
   */
  export class HatUtil extends BlockUtil {
    public target: Target;

    constructor(compiler: Compiler, block: SB3Block, public startingFunction: Fn) {
      super(compiler, block);
      this.target = compiler.target;
    }
  }

  // Block definitions
  export const statementLibrary: ObjectMap<StatementCompiler> = Object.create(null);
  export const inputLibrary: ObjectMap<InputCompiler> = Object.create(null);
  export const hatLibrary: ObjectMap<HatCompiler> = Object.create(null);

  /**
   * The new compiler for Scratch 3 projects.
   */
  export class Compiler {
    /**
     * The Stage or Sprite to compile.
     */
    public target: Target;
    /**
     * The raw .sb3 data for this target.
     */
    public data: SB3Target;
    /**
     * The blocks of this target.
     */
    public blocks: ObjectMap<SB3Block>;

    public labelCount: number = 0;

    constructor(target: Target) {
      this.target = target;
      this.data = target.sb3data;
      this.blocks = this.data.blocks;
    }

    /**
     * Gets the IDs of all hat blocks.
     */
    getHatBlocks(): string[] {
      return Object.keys(this.blocks)
        .filter((i) => this.blocks[i].topLevel);
    }

    /**
     * Get the compiler for a statement
     */
    getStatementCompiler(opcode: string): StatementCompiler | null {
      if (statementLibrary[opcode]) {
        return statementLibrary[opcode];
      }
      return null;
    }

    /**
     * Get the compiler for an input
     */
    getInputCompiler(opcode: string): InputCompiler | null {
      if (inputLibrary[opcode]) {
        return inputLibrary[opcode];
      }
      return null;
    }

    /**
     * Get the compiler for a hat
     */
    getHatCompiler(opcode: string): HatCompiler | null {
      if (hatLibrary[opcode]) {
        return hatLibrary[opcode];
      }
      return null;
    }

    /**
     * Gets the default value to use for a missing input.
     */
    getInputFallback(type: InputType): string {
      switch (type) {
        case 'number': return '0';
        case 'boolean': return 'false';
        case 'string': return '""';
        case 'any': return '""';
      }
      assertNever(type);
    }

    /**
     * Applies type coercions to JS to forcibly change it's type.
     */
    asType(input: string, type: InputType): string {
      switch (type) {
        case 'string': return '("" + ' + input + ')';
        case 'number': return '+' + input;
        case 'boolean': return 'bool(' + input + ')';
        case 'any': return input;
      }
      assertNever(type);
    }

    /**
     * Converts a compiled input to another type, if necessary
     */
    convertInputType(input: CompiledInput, type: InputType): string {
      // If the types are already identical, no changes are necessary
      if (input.type === type) {
        return input.source;
      }
      return this.asType(input.source, type);
    }

    /**
     * Sanitize a string into a CompiledInput
     */
    sanitizedInput(string: string): CompiledInput {
      return stringInput(this.sanitizedString(string));
    }

    /**
     * Sanitize a string for use in the runtime.
     */
    sanitizedString(string: string): string {
      string = string
        .replace(/\\/g, '\\\\')
        .replace(/'/g, '\\\'')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\{/g, '\\x7b')
        .replace(/\}/g, '\\x7d');
      return `"${string}"`;
    }

    /**
     * Determines the runtime object that owns a variable in the runtime.
     * The variable may be created if it cannot be found.
     */
    getVariableScope(name: string): string {
      if (name in this.target.stage.vars) {
        return 'self';
      } else if (name in this.target.vars) {
        return 'S';
      } else {
        // Create missing variables in the sprite scope.
        this.target.vars[name] = 0;
        return 'S';
      }
    }

    /**
     * Determines the runtime object that owns a list in the runtime.
     * The list may be created if it cannot be found.
     */
    getListScope(name: string): string {
      if (name in this.target.stage.lists) {
        return 'self';
      } else if (name in this.target.lists) {
        return 'S';
      } else {
        // Create missing lists in the sprite scope.
        this.target.lists[name] = new Scratch3List();
        return 'S';
      }
    }

    /**
     * Gets the runtime reference to a variable.
     */
    getVariableReference(name: string): string {
      return `${this.getVariableScope(name)}.vars[${this.sanitizedString(name)}]`;
    }

    /**
     * Gets the runtime reference to a list.
     */
    getListReference(name: string): string {
      return `${this.getListScope(name)}.lists[${this.sanitizedString(name)}]`;
    }

    /**
     * Compile a native or primitive value.
     */
    compileNativeInput(native: any[]): CompiledInput {
      const type = native[0];
      switch (type) {
        // These all function as numbers. I believe they are only differentiated so the editor can be more helpful.
        case NativeTypes.MATH_NUM:
        case NativeTypes.POSITIVE_NUM:
        case NativeTypes.WHOLE_NUM:
        case NativeTypes.INTEGER_NUM:
        case NativeTypes.ANGLE_NUM: {
          // [type, value]
          const number = parseFloat(native[1]);
          if (!isNaN(number)) {
            return numberInput(number.toString());
          } else {
            return this.sanitizedInput(native[1]);
          }
        }

        case NativeTypes.TEXT:
          // [type, text]
          return this.sanitizedInput(native[1] + '');

        case NativeTypes.VAR:
          // [type, name, id]
          return anyInput(this.getVariableReference(native[1]));

        case NativeTypes.LIST:
          // [type, name, id]
          return anyInput(this.getListReference(native[1]));

        case NativeTypes.BROADCAST:
          // [type, name, id]
          return this.sanitizedInput(native[1]);

        case NativeTypes.COLOR_PICKER: {
          // [type, color]
          // Color is a value like "#abcdef"
          const color = native[1];
          const hex = color.substr(1);
          // Ensure that it is actually a hex number.
          if (/^[0-9a-f]{6,8}$/.test(hex)) {
            return numberInput('0x' + hex);
          } else {
            this.warn('expected hex color code but got', hex);
            return numberInput('0x0');
          }
        }

        default:
          this.warn('unknown native', type, native);
          return stringInput('""');
      }
    }

    /**
     * Compile an input of a block, and do any necessary type coercions.
     */
    compileInput(block: SB3Block, inputName: string, type: InputType): string {
      // Handling empty inputs
      if (!block.inputs[inputName]) {
        return this.getInputFallback(type);
      }

      const input = block.inputs[inputName];

      if (Array.isArray(input[1])) {
        const native = input[1];
        return this.convertInputType(this.compileNativeInput(native), type);
      }

      const inputId = input[1];
      const inputBlock = this.blocks[inputId];
      const opcode = inputBlock.opcode;
      const compiler = this.getInputCompiler(opcode);
      if (!compiler) {
        this.warn('unknown input', opcode, inputBlock);
        return this.getInputFallback(type);
      }

      const util = new InputUtil(this, inputBlock);
      const result = compiler(util);

      return this.convertInputType(result, type);
    }

    /**
     * Get a field of a block.
     */
    getField(block: SB3Block, fieldName: string): string {
      // missing fields is very unusual, and probably a sign of another issue.
      const value = block.fields[fieldName];
      if (!block.fields[fieldName]) {
        this.warn('missing field', fieldName);
      }
      return value[0];
    }

    /**
     * Compile a script within a script.
     */
    compileSubstackInput(block: SB3Block, substackName: string): string {
      // empty substacks are normal
      if (!block.inputs[substackName]) {
        return '';
      }

      const substack = block.inputs[substackName];
      const type = substack[0];
      const id = substack[1];

      if (id === null) {
        return '';
      }

      return this.compileStack(id);
    }

    /**
     * Compile an entire script from a starting block.
     */
    compileStack(startingBlock: string): string {
      let script = '';
      let block = this.blocks[startingBlock];
      if(!block)debugger;

      while (true) {
        var opcode = block.opcode;
        const compiler = this.getStatementCompiler(opcode);

        if (compiler) {
          const util = new StatementUtil(this, block);
          compiler(util);
          script += util.content;
        } else {
          this.warn('unknown statement', opcode, block);
        }

        if (!block.next) {
          break;
        }
        block = this.blocks[block.next];
      }

      return script;
    }

    /**
     * Compile a hat block and its children.
     * The hat handler will be used, and the scripts will be installed.
     */
    compileHat(hat: SB3Block): void {
      const hatCompiler = this.getHatCompiler(hat.opcode);
      if (!hatCompiler) {
        // If a hat block is otherwise recognized as an input or statement, don't warn.
        // Most projects have at least one of these "dangling" blocks.
        if (!this.getInputCompiler(hat.opcode) && !this.getStatementCompiler(hat.opcode)) {
          this.warn('unknown hat block', hat.opcode, hat);
        }
        return;
      }

      this.labelCount = this.target.fns.length;

      const startingBlock = hat.next;
      // Empty hats will be ignored
      if (!startingBlock) {
        return;
      }

      // There is always a label placed at the beginning of the script.
      let script = `{{${this.labelCount++}}}` + this.compileStack(startingBlock);

      // If a block wants to preprocess the script, then let it.
      // TODO: should this happen after parseResult?
      if (hatCompiler.preprocess) {
        script = hatCompiler.preprocess(this, script);
      }

      // Parse the script to search for labels, and remove the label metadata.
      const parseResult = this.parseScript(script);
      const parsedScript = parseResult.script;

      const startFn = this.target.fns.length;
      for (let label of Object.keys(parseResult.labels)) {
        this.target.fns[label] = P.runtime.createContinuation(parsedScript.slice(parseResult.labels[label]));
      }

      const startingFn = this.target.fns[startFn];
      const util = new HatUtil(this, hat, startingFn);
      hatCompiler.handle(util);

      console.log('compiled sb3 script', hat.opcode, script, this.target);
    }

    /**
     * Parse a generated script for label locations, and remove redundant data.
     */
    parseScript(script: string): { labels: ObjectMap<number>, script: string; } {
      const labels = {};
      let index = 0;
      let accumulator = 0;

      while (true) {
        const labelStart = script.indexOf('{{', index);
        if (labelStart === -1) {
          break;
        }
        const labelEnd = script.indexOf('}}', index);
        const id = script.substring(labelStart + 2, labelEnd);
        const length = labelEnd + 2 - labelStart;
        accumulator += length;

        labels[id] = labelEnd + 2 - accumulator;

        index = labelEnd + 2;
      }

      // We don't **actually* have to remove the {{0}} labels (its technically valid JS),
      // but it's probably a good idea.
      const fixedScript = script.replace(/{{\d+}}/g, '');

      return {
        labels,
        script: fixedScript,
      };
    }

    /**
     * Log a warning
     */
    warn(...args: any[]) {
      console.warn.apply(console, args);
    }

    /**
     * Compiles the scripts of the target with the current data.
     */
    compile(): void {
      const hats = this.getHatBlocks();

      for (const hatId of hats) {
        const hat = this.blocks[hatId];
        this.compileHat(hat);
      }
    }
  }
}

/**
 * Scratch 3 blocks.
 */
(function() {
  const statementLibrary = P.sb3.compiler2.statementLibrary;
  const inputLibrary = P.sb3.compiler2.inputLibrary;
  const hatLibrary = P.sb3.compiler2.hatLibrary;

  /* Statements */
  statementLibrary['motion_movesteps'] = function(util) {
    const STEPS = util.getInput('STEPS', 'number');
    util.writeLn(`S.forward(${STEPS});`);
    util.visual('drawing');
  };
  statementLibrary['motion_turnright'] = function(util) {
    const DEGREES = util.getInput('DEGREES', 'number');
    util.writeLn(`S.setDirection(S.direction + ${DEGREES});`);
    util.visual('visible');
  };
  statementLibrary['motion_turnleft'] = function(util) {
    const DEGREES = util.getInput('DEGREES', 'number');
    util.writeLn(`S.setDirection(S.direction - ${DEGREES});`);
    util.visual('visible');
  };
  statementLibrary['motion_goto'] = function(util) {
    const TO = util.getInput('TO', 'any');
    util.writeLn(`S.gotoObject(${TO});`);
    util.visual('drawing');
  };
  statementLibrary['motion_gotoxy'] = function(util) {
    const X = util.getInput('X', 'number');
    const Y = util.getInput('Y', 'number');
    util.writeLn(`S.moveTo(${X}, ${Y});`);
    util.visual('drawing');
  };
  statementLibrary['motion_glideto'] = function(util) {
    const SECS = util.getInput('SECS', 'any');
    const TO = util.getInput('TO', 'any');
    util.visual('drawing');
    util.writeLn('save();');
    util.writeLn('R.start = runtime.now;');
    util.writeLn(`R.duration = ${SECS};`);
    util.writeLn('R.baseX = S.scratchX;');
    util.writeLn('R.baseY = S.scratchY;');
    util.writeLn(`var to = self.getPosition(${TO});`);
    util.writeLn('if (to) {');
    util.writeLn('  R.deltaX = to.x - S.scratchX;');
    util.writeLn('  R.deltaY = to.y - S.scratchY;');
    const label = util.addLabel();
    util.writeLn('  var f = (runtime.now - R.start) / (R.duration * 1000);');
    util.writeLn('  if (f > 1 || isNaN(f)) f = 1;');
    util.writeLn('  S.moveTo(R.baseX + f * R.deltaX, R.baseY + f * R.deltaY);');
    util.writeLn('  if (f < 1) {');
    util.forceQueue(label);
    util.writeLn('  }');
    util.writeLn('  restore();');
    util.writeLn('}');
  };
  statementLibrary['motion_glidesecstoxy'] = function(util) {
    const SECS = util.getInput('SECS', 'any');
    const X = util.getInput('X', 'any');
    const Y = util.getInput('Y', 'any');
    util.visual('drawing');
    util.writeLn('save();');
    util.writeLn('R.start = runtime.now;');
    util.writeLn(`R.duration = ${SECS};`);
    util.writeLn('R.baseX = S.scratchX;');
    util.writeLn('R.baseY = S.scratchY;');
    util.writeLn(`R.deltaX = ${X} - S.scratchX;`);
    util.writeLn(`R.deltaY = ${Y} - S.scratchY;`);
    const label = util.addLabel();
    util.writeLn('var f = (runtime.now - R.start) / (R.duration * 1000);');
    util.writeLn('if (f > 1) f = 1;');
    util.writeLn('S.moveTo(R.baseX + f * R.deltaX, R.baseY + f * R.deltaY);');
    util.writeLn('if (f < 1) {');
    util.forceQueue(label);
    util.writeLn('}');
    util.writeLn('restore();');
  };
  statementLibrary['motion_pointindirection'] = function(util) {
    const DIRECTION = util.getInput('DIRECTION', 'number');
    util.visual('visible');
    util.writeLn(`S.direction = ${DIRECTION};`);
  };
  statementLibrary['motion_pointtowards'] = function(util) {
    const TOWARDS = util.getInput('TOWARDS', 'any');
    util.writeLn(`S.pointTowards(${TOWARDS});`);
    util.visual('visible');
  };
  statementLibrary['motion_changexby'] = function(util) {
    const DX = util.getInput('DX', 'number');
    util.writeLn(`S.moveTo(S.scratchX + ${DX}, S.scratchY);`);
    util.visual('drawing');
  };
  statementLibrary['motion_setx'] = function(util) {
    const X = util.getInput('X', 'number');
    util.writeLn(`S.moveTo(${X}, S.scratchY);`);
    util.visual('drawing');
  };
  statementLibrary['motion_changeyby'] = function(util) {
    const DY = util.getInput('DY', 'number');
    util.writeLn(`S.moveTo(S.scratchX, S.scratchY + ${DY});`);
    util.visual('drawing');
  };
  statementLibrary['motion_sety'] = function(util) {
    const Y = util.getInput('Y', 'number');
    util.writeLn(`S.moveTo(S.scratchX, ${Y});`);
    util.visual('drawing');
  };
  statementLibrary['motion_ifonedgebounce'] = function(util) {
    // TODO: set visual if bounced
    util.writeLn('S.bounceOffEdge();');
  };
  statementLibrary['motion_setrotationstyle'] = function(util) {
    const STYLE = P.utils.parseRotationStyle(util.getField('STYLE'));
    util.writeLn(`S.rotationStyle = ${STYLE};`);
    util.visual('visible');
  };

  // Looks
  statementLibrary['looks_sayforsecs'] = function(util) {
    const MESSAGE = util.getInput('MESSAGE', 'any');
    const SECS = util.getInput('SECS', 'number');
    util.writeLn('save();');
    util.writeLn(`R.id = S.say(${MESSAGE}, false);`);
    util.writeLn('R.start = runtime.now;');
    util.writeLn(`R.duration = ${SECS};`);
    const label = util.addLabel();
    util.writeLn('if (runtime.now - R.start < R.duration * 1000) {');
    util.forceQueue(label);
    util.writeLn('}');
    util.writeLn('if (S.sayId === R.id) {');
    util.writeLn('  S.say("");');
    util.writeLn('}');
    util.writeLn('restore();');
    util.visual('visible');
  };
  statementLibrary['looks_say'] = function(util) {
    const MESSAGE = util.getInput('MESSAGE', 'any');
    util.writeLn(`S.say(${MESSAGE}, false);`);
  };
  statementLibrary['looks_thinkforsecs'] = function(util) {
    const MESSAGE = util.getInput('MESSAGE', 'any');
    const SECS = util.getInput('SECS', 'number');
    util.writeLn('save();');
    util.writeLn(`R.id = S.say(${MESSAGE}, true);`);
    util.writeLn('R.start = runtime.now;');
    util.writeLn(`R.duration = ${SECS};`);
    const label = util.addLabel();
    util.writeLn('if (runtime.now - R.start < R.duration * 1000) {');
    util.forceQueue(label);
    util.writeLn('}');
    util.writeLn('if (S.sayId === R.id) {');
    util.writeLn('  S.say("");');
    util.writeLn('}');
    util.writeLn('restore();');
    util.visual('visible');
  };
  statementLibrary['looks_think'] = function(util) {
    const MESSAGE = util.getInput('MESSAGE', 'any');
    util.writeLn(`S.say(${MESSAGE}, true);`);
    util.visual('visible');
  };
  statementLibrary['looks_switchcostumeto'] = function(util) {
    const COSTUME = util.getInput('COSTUME', 'any');
    util.writeLn(`S.setCostume(${COSTUME});`);
    util.visual('visible');
  };
  statementLibrary['looks_nextcostume'] = function(util) {
    util.writeLn('S.showNextCostume();');
    util.visual('visible');
  };
  statementLibrary['looks_switchbackdropto'] = function(util) {
    const BACKDROP = util.getInput('BACKDROP', 'any');
    util.writeLn(`self.setCostume(${BACKDROP});`);
    util.visual('always');
    util.writeLn('var threads = backdropChange();');
    util.writeLn('if (threads.indexOf(BASE) !== -1) {return;}');
  };
  statementLibrary['looks_nextbackdrop'] = function(util) {
    util.writeLn('self.showNextCostume();');
    util.visual('always');
    util.writeLn('var threads = backdropChange();');
    util.writeLn('if (threads.indexOf(BASE) !== -1) {return;}');
  };
  statementLibrary['looks_changesizeby'] = function(util) {
    const CHANGE = util.getInput('CHANGE', 'any');
    util.writeLn(`var f = S.scale + ${CHANGE} / 100;`);
    util.writeLn('S.scale = f < 0 ? 0 : f;');
    util.visual('visible');
  };
  statementLibrary['looks_setsizeto'] = function(util) {
    const SIZE = util.getInput('SIZE', 'number');
    util.writeLn(`S.scale = Math.max(0, ${SIZE} / 100);`)
    util.visual('visible');
  };
  statementLibrary['looks_changeeffectby'] = function(util) {
    const EFFECT = util.sanitizedString(util.getField('EFFECT')).toLowerCase();
    const CHANGE = util.getInput('CHANGE', 'number');
    util.writeLn(`S.changeFilter(${EFFECT}, ${CHANGE});`);
    util.visual('visible');
  };
  statementLibrary['looks_seteffectto'] = function(util) {
    const EFFECT = util.sanitizedString(util.getField('EFFECT')).toLowerCase();
    const VALUE = util.getInput('VALUE', 'number');
    util.writeLn(`S.setFilter(${EFFECT}, ${VALUE});`);
    util.visual('visible');
  };
  statementLibrary['looks_cleargraphiceffects'] = function(util) {
    util.writeLn('S.resetFilters();');
    util.visual('visible');
  };
  statementLibrary['looks_show'] = function(util) {
    util.writeLn('S.visible = true;');
    util.visual('always');
    util.updateBubble();
  };
  statementLibrary['looks_hide'] = function(util) {
    util.visual('visible');
    util.writeLn('S.visible = false;');
    util.updateBubble();
  };
  statementLibrary['looks_gotofrontback'] = function(util) {
    const FRONT_BACK = util.getField('FRONT_BACK');
    util.writeLn('var i = self.children.indexOf(S);');
    util.writeLn('if (i !== -1) self.children.splice(i, 1);');
    if (FRONT_BACK === 'front') {
      util.writeLn('self.children.push(S);');
    } else {
      util.writeLn('self.children.unshift(S);');
    }
  };
  statementLibrary['looks_goforwardbackwardlayers'] = function(util) {
    const FORWARD_BACKWARD = util.getField('FORWARD_BACKWARD');
    const NUM = util.getInput('NUM', 'number');
    util.writeLn('var i = self.children.indexOf(S);');
    util.writeLn('if (i !== -1) {');
    util.writeLn('  self.children.splice(i, 1);');
    if (FORWARD_BACKWARD === 'forward') {
      util.writeLn(`  self.children.splice(Math.min(self.children.length - 1, i + ${NUM}), 0, S);`);
    } else {
      util.writeLn(`  self.children.splice(Math.max(0, i - ${NUM}), 0, S);`);
    }
    util.writeLn('}');
  };

  // Sounds
  statementLibrary['sound_playuntildone'] = function(util) {
    const SOUND_MENU = util.getInput('SOUND_MENU', 'any');
    util.writeLn(`var sound = S.getSound(${SOUND_MENU});`);
    util.writeLn('if (sound) {');
    util.writeLn('  playSound(sound);');
    util.wait('sound.duration');
    util.writeLn('}');
  };
  statementLibrary['sound_play'] = function(util) {
    const SOUND_MENU = util.getInput('SOUND_MENU', 'any');
    util.writeLn(`var sound = S.getSound(${SOUND_MENU});`);
    util.writeLn('if (sound) {');
    util.writeLn('  playSound(sound);');
    util.writeLn('}');
  };
  statementLibrary['sound_stopallsounds'] = function(util) {
    if (P.audio.context) {
      util.writeLn('self.stopAllSounds();');
    }
  };
  statementLibrary['sound_changevolumeby'] = function(util) {
    const VOLUME = util.getInput('VOLUME', 'number');
    util.writeLn(`S.volume = Math.max(0, Math.min(1, S.volume + ${VOLUME} / 100));`);
    util.writeLn('if (S.node) S.node.gain.setValueAtTime(S.volume, audioContext.currentTime);');
    util.writeLn('for (var sounds = S.sounds, i = sounds.length; i--;) {');
    util.writeLn('  var sound = sounds[i];');
    util.writeLn('  if (sound.node && sound.target === S) {');
    util.writeLn('    sound.node.gain.setValueAtTime(S.volume, audioContext.currentTime);');
    util.writeLn('  }');
    util.writeLn('}');
  };
  statementLibrary['sound_setvolumeto'] = function(util) {
    const VOLUME = util.getInput('VOLUME', 'number');
    util.writeLn(`S.volume = Math.max(0, Math.min(1, ${VOLUME} / 100));`);
    util.writeLn('if (S.node) S.node.gain.setValueAtTime(S.volume, audioContext.currentTime);');
    util.writeLn('for (var sounds = S.sounds, i = sounds.length; i--;) {');
    util.writeLn('  var sound = sounds[i];');
    util.writeLn('  if (sound.node && sound.target === S) {');
    util.writeLn('    sound.node.gain.setValueAtTime(S.volume, audioContext.currentTime);');
    util.writeLn('  }');
    util.writeLn('}');
  };

  statementLibrary['event_broadcast'] = function(util) {
    const BROADCAST_INPUT = util.getInput('BROADCAST_INPUT', 'any');
    util.writeLn(`var threads = broadcast(${BROADCAST_INPUT});`);
    util.writeLn('if (threads.indexOf(BASE) !== -1) {return;}');
  };
  statementLibrary['event_broadcastandwait'] = function(util) {
    const BROADCAST_INPUT = util.getInput('BROADCAST_INPUT', 'any');
    util.writeLn('save();');
    util.writeLn(`R.threads = broadcast(${BROADCAST_INPUT});`);
    util.writeLn('if (R.threads.indexOf(BASE) !== -1) {return;}');
    const label = util.addLabel();
    util.writeLn('if (running(R.threads)) {');
    util.forceQueue(label);
    util.writeLn('}');
    util.writeLn('restore();');
  };

  statementLibrary['control_wait'] = function(util) {
    const DURATION = util.getInput('DURATION', 'any');
    util.writeLn('save();');
    util.writeLn('R.start = runtime.now;');
    util.writeLn(`R.duration = ${DURATION};`);
    util.writeLn(`var first = true;`);
    const label = util.addLabel();
    util.writeLn('if (runtime.now - R.start < R.duration * 1000 || first) {');
    util.writeLn('  var first;');
    util.forceQueue(label);
    util.writeLn('}');
    util.writeLn('restore();');
  };
  statementLibrary['control_repeat'] = function(util) {
    const TIMES = util.getInput('TIMES', 'any');
    const SUBSTACK = util.getSubstack('SUBSTACK');
    util.writeLn('save();');
    util.writeLn(`R.count = ${TIMES};`);
    const label = util.addLabel();
    util.writeLn('if (R.count >= 0.5) {');
    util.writeLn('  R.count -= 1;');
    util.writeLn(SUBSTACK);
    util.queue(label);
    util.writeLn('} else {');
    util.writeLn('  restore();');
    util.writeLn('}');
  };
  statementLibrary['control_forever'] = function(util) {
    const SUBSTACK = util.getSubstack('SUBSTACK');
    const label = util.addLabel();
    util.write(SUBSTACK);
    util.queue(label);
  };
  statementLibrary['control_if'] = function(util) {
    const CONDITION = util.getInput('CONDITION', 'any');
    const SUBSTACK = util.getSubstack('SUBSTACK');
    util.writeLn(`if (${CONDITION}) {`);
    util.write(SUBSTACK);
    util.writeLn('}');
  };
  statementLibrary['control_if_else'] = function(util) {
    const CONDITION = util.getInput('CONDITION', 'any');
    const SUBSTACK = util.getSubstack('SUBSTACK');
    const SUBSTACK2 = util.getSubstack('SUBSTACK2');
    util.writeLn(`if (${CONDITION}) {`);
    util.write(SUBSTACK);
    util.writeLn('} else {');
    util.write(SUBSTACK2);
    util.writeLn('}');
  };
  statementLibrary['control_wait_until'] = function(util) {
    const CONDITION = util.getInput('CONDITION', 'boolean');
    const label = util.addLabel();
    util.writeLn(`if (!${CONDITION}) {`);
    util.forceQueue(label);
    util.writeLn('}');
  };
  statementLibrary['control_repeat_until'] = function(util) {
    const CONDITION = util.getInput('CONDITION', 'boolean');
    const SUBSTACK = util.getSubstack('SUBSTACK');
    const label = util.addLabel();
    util.writeLn(`if (!${CONDITION}) {`);
    util.writeLn(SUBSTACK);
    util.queue(label);
    util.writeLn('}');
  };
  statementLibrary['control_while'] = function(util) {
    const CONDITION = util.getInput('CONDITION', 'boolean');
    const SUBSTACK = util.getSubstack('SUBSTACK');
    const label = util.addLabel();
    util.writeLn(`if (${CONDITION}) {`);
    util.writeLn(SUBSTACK);
    util.queue(label);
    util.writeLn('}');
  };
  statementLibrary['control_all_at_once'] = function(util) {
    // https://github.com/LLK/scratch-vm/blob/bb42c0019c60f5d1947f3432038aa036a0fddca6/src/blocks/scratch3_control.js#L194-L199
    const SUBSTACK = util.getSubstack('SUBSTACK');
    util.write(SUBSTACK);
  };
  statementLibrary['control_stop'] = function(util) {
    const STOP_OPTION = util.getField('STOP_OPTION');
    switch (STOP_OPTION) {
      case 'all':
        util.writeLn('runtime.stopAll(); return;');
        break;
      case 'this script':
        util.writeLn('endCall(); return;');
        break;
      case 'other scripts in sprite':
      case 'other scripts in stage':
        util.writeLn('for (var i = 0; i < runtime.queue.length; i++) {');
        util.writeLn('  if (i !== THREAD && runtime.queue[i] && runtime.queue[i].sprite === S) {');
        util.writeLn('    runtime.queue[i] = undefined;');
        util.writeLn('  }');
        util.writeLn('}');
        break;
    }
  };
  statementLibrary['control_create_clone_of'] = function(util) {
    const CLONE_OPTION = util.getInput('CLONE_OPTION', 'any');
    util.writeLn(`clone(${CLONE_OPTION});`);
  };
  statementLibrary['control_delete_this_clone'] = function(util) {
    util.writeLn('if (S.isClone) {\n');
    util.writeLn('  S.remove();\n');
    util.writeLn('  var i = self.children.indexOf(S);\n');
    util.writeLn('  if (i !== -1) self.children.splice(i, 1);\n');
    util.writeLn('  for (var i = 0; i < runtime.queue.length; i++) {\n');
    util.writeLn('    if (runtime.queue[i] && runtime.queue[i].sprite === S) {\n');
    util.writeLn('      runtime.queue[i] = undefined;\n');
    util.writeLn('    }\n');
    util.writeLn('  }\n');
    util.writeLn('  return;\n');
    util.writeLn('}\n');
  };
  statementLibrary['control_incr_counter'] = function(util) {
    util.writeLn('self.counter++;');
  };
  statementLibrary['control_clear_counter'] = function(util) {
    util.writeLn('self.counter = 0;');
  };

  statementLibrary['sensing_askandwait'] = function(util) {
    const QUESTION = util.getInput('QUESTION', 'string');

    util.writeLn('R.id = self.nextPromptId++;');
    const label1 = util.addLabel();
    util.writeLn('if (self.promptId < R.id) {');
    util.forceQueue(label1);
    util.writeLn('}');

    util.writeLn(`S.ask(${QUESTION});`);
    const label2 = util.addLabel();
    util.writeLn('if (self.promptId === R.id) {')
    util.forceQueue(label2);
    util.writeLn('}');

    util.visual('always');
  };
  statementLibrary['sensing_setdragmode'] = function(util) {
    const DRAG_MODE = util.getField('DRAG_MODE');
    if (DRAG_MODE === 'draggable') {
      util.writeLn('S.isDraggable = true;');
    } else {
      util.writeLn('S.isDraggable = false;');
    }
  };

  statementLibrary['sensing_resettimer'] = function(util) {
    util.writeLn('runtime.timerStart = runtime.now;');
  };

  statementLibrary['data_setvariableto'] = function(util) {
    const VARIABLE = util.getVariableReference('VARIABLE');
    const VALUE = util.getInput('VALUE', 'any');
    util.writeLn(`${VARIABLE} = ${VALUE};`);
  };
  statementLibrary['data_changevariableby'] = function(util) {
    const VARIABLE = util.getVariableReference('VARIABLE');
    const VALUE = util.getInput('VALUE', 'any');
    util.writeLn(`${VARIABLE} = (${util.asType(VARIABLE, 'number')} + ${VALUE});`);
  };
  statementLibrary['data_showvariable'] = function(util) {
    const VARIABLE = util.sanitizedString(util.getField('VARIABLE'));
    const scope = util.getVariableScope('VARIABLE');
    util.writeLn(`${scope}.showVariable(${VARIABLE}, true);`);
  };
  statementLibrary['data_hidevariable'] = function(util) {
    const VARIABLE = util.sanitizedString(util.getField('VARIABLE'));
    const scope = util.getVariableScope('VARIABLE');
    util.writeLn(`${scope}.showVariable(${VARIABLE}, false);`);
  };
  statementLibrary['data_showlist'] = function(util) {
    const LIST = util.sanitizedString(util.getField('LIST'));
    const scope = util.getListScope('LIST');
    util.writeLn(`${scope}.showVariable(${LIST}, true);`);
  };
  statementLibrary['data_hidelist'] = function(util) {
    const LIST = util.sanitizedString(util.getField('LIST'));
    const scope = util.getListScope('LIST');
    util.writeLn(`${scope}.showVariable(${LIST}, false);`);
  };
  statementLibrary['data_addtolist'] = function(util) {
    const LIST = util.getListReference('LIST');
    const ITEM = util.getInput('ITEM', 'any');
    util.writeLn(`${LIST}.push(${ITEM});`);
  };
  statementLibrary['data_deleteoflist'] = function(util) {
    const LIST = util.getListReference('LIST');
    const INDEX = util.getInput('INDEX', 'any');
    util.writeLn(`${LIST}.deleteLine(${INDEX});`);
  };
  statementLibrary['data_deletealloflist'] = function(util) {
    const LIST = util.getListReference('LIST');
    util.writeLn(`${LIST}.deleteLine("all");`);
  };
  statementLibrary['data_insertatlist'] = function(util) {
    const LIST = util.getListReference('LIST');
    const ITEM = util.getInput('ITEM', 'any');
    const INDEX = util.getInput('INDEX', 'any');
    util.writeLn(`${LIST}.insert(${INDEX}, ${ITEM});`);
  };
  statementLibrary['data_replaceitemoflist'] = function(util) {
    const LIST = util.getListReference('LIST');
    const ITEM = util.getInput('ITEM', 'any');
    const INDEX = util.getInput('INDEX', 'any');
    util.writeLn(`${LIST}.set(${INDEX}, ${ITEM});`);
  };

  statementLibrary['procedures_call'] = function(util) {
    const mutation = util.block.mutation;
    const name = mutation.proccode;

    if (P.config.debug && name === 'forkphorus:debugger;') {
      util.writeLn('/* forkphorus debugger */ debugger;');
      return;
    }

    const id = util.nextLabel();
    util.write(`call(S.procedures[${util.sanitizedString(name)}], ${id}, [`);

    // The mutation has a stringified JSON list of input IDs... it's weird.
    const inputNames = JSON.parse(mutation.argumentids);
    for (const inputName of inputNames) {
      util.write(`${util.getInput(inputName, 'any')}, `);
    }

    util.write(']);\n');

    util.writeLn('return;');
    util.addLabel();
  };

  statementLibrary['pen_clear'] = function(util) {
    util.writeLn('self.clearPen();');
    util.visual('always');
  };
  statementLibrary['pen_stamp'] = function(util) {
    util.writeLn('S.stamp();');
    util.visual('always');
  };
  statementLibrary['pen_penDown'] = function(util) {
    util.writeLn('S.isPenDown = true;');
    util.writeLn('S.dotPen();');
    util.visual('always');
  };
  statementLibrary['pen_penUp'] = function(util) {
    // TODO: determine visual variant
    // definitely not 'always' or 'visible', might be a 'if (S.isPenDown)'
    util.writeLn('S.isPenDown = false;');
  };
  statementLibrary['pen_setPenColorToColor'] = function(util) {
    const COLOR = util.getInput('COLOR', 'number');
    util.writeLn(`S.setPenColor(${COLOR});`);
  };
  statementLibrary['pen_setPenHueToNumber'] = function(util) {
    // This is an old pen hue block, which functions differently from the new one.
    const HUE = util.getInput('HUE', 'number');
    util.writeLn('S.setPenColorHSL();');
    util.writeLn(`S.penHue = ${HUE} * 360 / 200;`);
    util.writeLn('S.penSaturation = 100;');
  };
  statementLibrary['pen_changePenHueBy'] = function(util) {
    // This is an old pen hue block, which functions differently from the new one.
    const HUE = util.getInput('HUE', 'number');
    util.writeLn('S.setPenColorHSL();');
    util.writeLn(`S.penHue += ${HUE} * 360 / 200;`);
    util.writeLn('S.penSaturation = 100;');
  };
  statementLibrary['pen_setPenShadeToNumber'] = function(util) {
    const SHADE = util.getInput('SHADE', 'number');
    util.writeLn('S.setPenColorHSL();');
    util.writeLn(`S.penLightness = ${SHADE} % 200;`);
    util.writeLn('if (S.penLightness < 0) S.penLightness += 200;');
    util.writeLn('S.saturation = 100;');
  };
  statementLibrary['pen_changePenShadeBy'] = function(util) {
    const SHADE = util.getInput('SHADE', 'number');
    util.writeLn('S.setPenColorHSL();');
    util.writeLn(`S.penLightness = (S.penLightness + ${SHADE}) % 200;`);
    util.writeLn('if (S.penLightness < 0) S.penLightness += 200;');
    util.writeLn('S.saturation = 100;');
  };
  statementLibrary['pen_setPenColorParamTo'] = function(util) {
    const COLOR_PARAM = util.getInput('COLOR_PARAM', 'string');
    const VALUE = util.getInput('VALUE', 'number');
    util.writeLn(`S.setPenColorParam(${COLOR_PARAM}, ${VALUE});`);
  };
  statementLibrary['pen_changePenColorParamBy'] = function(util) {
    const COLOR_PARAM = util.getInput('COLOR_PARAM', 'string');
    const VALUE = util.getInput('VALUE', 'number');
    util.writeLn(`S.changePenColorParam(${COLOR_PARAM}, ${VALUE});`);
  };
  statementLibrary['pen_changePenSizeBy'] = function(util) {
    const SIZE = util.getInput('SIZE', 'number');
    util.writeLn(`S.penSize = Math.max(1, S.penSize + ${SIZE});`);
  };
  statementLibrary['pen_setPenSizeTo'] = function(util) {
    const SIZE = util.getInput('SIZE', 'number');
    util.writeLn(`S.penSize = Math.max(1, ${SIZE});`);
  };

  statementLibrary['music_setTempo'] = function(util) {
    const TEMPO = util.getInput('TEMPO', 'number');
    util.writeLn(`self.tempoBPM = ${TEMPO};`)
  };
  statementLibrary['music_changeTempo'] = function(util) {
    const TEMPO = util.getInput('TEMPO', 'number');
    util.writeLn(`self.tempoBPM += ${TEMPO};`)
  };

  // Legacy no-ops.
  // https://github.com/LLK/scratch-vm/blob/bb42c0019c60f5d1947f3432038aa036a0fddca6/src/blocks/scratch3_motion.js#L19
  // https://github.com/LLK/scratch-vm/blob/bb42c0019c60f5d1947f3432038aa036a0fddca6/src/blocks/scratch3_looks.js#L248
  const noopStatement = (util: P.sb3.compiler2.StatementUtil) => util.writeLn('/* noop */');
  statementLibrary['motion_scroll_right'] = noopStatement;
  statementLibrary['motion_scroll_up'] = noopStatement;
  statementLibrary['motion_align_scene'] = noopStatement;
  statementLibrary['looks_changestretchby'] = noopStatement;
  statementLibrary['looks_setstretchto'] = noopStatement;
  statementLibrary['looks_hideallsprites'] = noopStatement;

  /* Inputs */
  inputLibrary['argument_reporter_boolean'] = function(util) {
    const NAME = util.sanitizedString(util.getField('NAME'));
    return util.booleanInput(util.asType(`C.args[${NAME}]`, 'boolean'));
  };
  inputLibrary['argument_reporter_string_number'] = function(util) {
    const VALUE = util.sanitizedString(util.getField('VALUE'));
    return util.anyInput(`C.args[${VALUE}]`);
  };
  inputLibrary['control_create_clone_of_menu'] = function(util) {
    return util.fieldInput('CLONE_OPTION');
  };
  inputLibrary['control_get_counter'] = function(util) {
    return util.numberInput('self.counter');
  };
  inputLibrary['data_itemoflist'] = function(util) {
    const LIST = util.getListReference('LIST');
    const INDEX = util.getInput('INDEX', 'any');
    return util.anyInput(`getLineOfList(${LIST}, ${INDEX})`);
  };
  inputLibrary['data_itemnumoflist'] = function(util) {
    const LIST = util.getListReference('LIST');
    const ITEM = util.getInput('ITEM', 'any');
    return util.numberInput(`listIndexOf(${LIST}, ${ITEM})`);
  };
  inputLibrary['data_lengthoflist'] = function(util) {
    const LIST = util.getListReference('LIST');
    return util.numberInput(`${LIST}.length`);
  };
  inputLibrary['data_listcontainsitem'] = function(util) {
    const LIST = util.getListReference('LIST');
    const ITEM = util.getInput('ITEM', 'any');
    return util.booleanInput(`listContains(${LIST}, ${ITEM})`);
  };
  inputLibrary['looks_backdropnumbername'] = function(util) {
    const NUMBER_NAME = util.getField('NUMBER_NAME');
    if (NUMBER_NAME === 'number') {
      return util.numberInput('(self.currentCostumeIndex + 1)');
    } else {
      return util.stringInput('self.costumes[self.currentCostumeIndex].name');
    }
  };
  inputLibrary['looks_backdrops'] = function(util) {
    return util.fieldInput('BACKDROP');
  };
  inputLibrary['looks_costume'] = function(util) {
    return util.fieldInput('COSTUME');
  };
  inputLibrary['looks_costumenumbername'] = function(util) {
    const NUMBER_NAME = util.getField('NUMBER_NAME');
    if (NUMBER_NAME === 'number') {
      return util.numberInput('(S.currentCostumeIndex + 1)');
    } else {
      return util.stringInput('S.costumes[S.currentCostumeIndex].name');
    }
  };
  inputLibrary['looks_size'] = function(util) {
    return util.numberInput('(S.scale * 100)');
  };
  inputLibrary['makeymakey_menu_KEY'] = function(util) {
    return util.fieldInput('KEY');
  };
  inputLibrary['matrix'] = function(util) {
    return util.fieldInput('MATRIX');
  };
  inputLibrary['motion_direction'] = function(util) {
    return util.numberInput('S.direction');
  };
  inputLibrary['motion_glideto_menu'] = function(util) {
    return util.fieldInput('TO');
  };
  inputLibrary['motion_goto_menu'] = function(util) {
    return util.fieldInput('TO');
  };
  inputLibrary['motion_pointowards_menu'] = function(util) {
    return util.fieldInput('TOWARDS');
  };
  inputLibrary['motion_xposition'] = function(util) {
    return util.numberInput('S.scratchX');
  };
  inputLibrary['motion_yposition'] = function(util) {
    return util.numberInput('S.scratchY');
  };
  inputLibrary['music_getTempo'] = function(util) {
    return util.numberInput('self.tempoBPM');
  };
  inputLibrary['operator_add'] = function(util) {
    const NUM1 = util.getInput('NUM1', 'number');
    const NUM2 = util.getInput('NUM2', 'number');
    return util.numberInput(`(${NUM1} + ${NUM2} || 0)`);
  };
  inputLibrary['operator_and'] = function(util) {
    const OPERAND1 = util.getInput('OPERAND1', 'any');
    const OPERAND2 = util.getInput('OPERAND2', 'any');
    return util.booleanInput(`(${OPERAND1} && ${OPERAND2})`);
  };
  inputLibrary['operator_contains'] = function(util) {
    const STRING1 = util.getInput('STRING1', 'string');
    const STRING2 = util.getInput('STRING2', 'string');
    // TODO: case sensitivity?
    // TODO: use indexOf?
    return util.booleanInput(`${STRING1}.includes(${STRING2})`);
  };
  inputLibrary['operator_divide'] = function(util) {
    const NUM1 = util.getInput('NUM1', 'number');
    const NUM2 = util.getInput('NUM2', 'number');
    return util.numberInput(`(${NUM1} / ${NUM2} || 0)`);
  };
  inputLibrary['operator_equals'] = function(util) {
    const OPERAND1 = util.getInput('OPERAND1', 'any');
    const OPERAND2 = util.getInput('OPERAND2', 'any');
    return util.booleanInput(`equal(${OPERAND1}, ${OPERAND2})`);
  };
  inputLibrary['operator_gt'] = function(util) {
    const OPERAND1 = util.getInput('OPERAND1', 'any');
    const OPERAND2 = util.getInput('OPERAND2', 'any');
    // TODO: use numGreater?
    return util.booleanInput(`(compare(${OPERAND1}, ${OPERAND2}) === 1)`);
  };
  inputLibrary['operator_join'] = function(util) {
    const STRING1 = util.getInput('STRING1', 'string');
    const STRING2 = util.getInput('STRING2', 'string');
    return util.stringInput(`(${STRING1} + ${STRING2})`)
  };
  inputLibrary['operator_length'] = function(util) {
    const STRING = util.getInput('STRING', 'string');
    // TODO: parenthesis important?
    return util.numberInput(`(${STRING}).length`);
  };
  inputLibrary['operator_letter_of'] = function(util) {
    const STRING = util.getInput('STRING', 'string');
    const LETTER = util.getInput('LETTER', 'number');
    return util.stringInput(`((${STRING})[(${LETTER} | 0) - 1] || "")`);
  };
  inputLibrary['operator_lt'] = function(util) {
    const OPERAND1 = util.getInput('OPERAND1', 'any');
    const OPERAND2 = util.getInput('OPERAND2', 'any');
    // TODO: use numLess?
    return util.booleanInput(`(compare(${OPERAND1}, ${OPERAND2}) === -1)`);
  };
  inputLibrary['operator_mathop'] = function(util) {
    const OPERATOR = util.getField('OPERATOR');
    const NUM = util.getInput('NUM', 'number');

    switch (OPERATOR) {
      case 'abs':
        return util.numberInput(`Math.abs(${NUM})`);
      case 'floor':
        return util.numberInput(`Math.floor(${NUM})`);
      case 'sqrt':
        return util.numberInput(`Math.sqrt(${NUM})`);
      case 'ceiling':
        return util.numberInput(`Math.ceil(${NUM})`);
      case 'cos':
        return util.numberInput(`Math.cos(${NUM} * Math.PI / 180)`);
      case 'sin':
        return util.numberInput(`Math.sin(${NUM} * Math.PI / 180)`);
      case 'tan':
        return util.numberInput(`Math.tan(${NUM} * Math.PI / 180)`);
      case 'asin':
        return util.numberInput(`(Math.asin(${NUM}) * 180 / Math.PI)`)
      case 'acos':
        return util.numberInput(`(Math.acos(${NUM}) * 180 / Math.PI)`)
      case 'atan':
        return util.numberInput(`(Math.atan(${NUM}) * 180 / Math.PI)`)
      case 'ln':
        return util.numberInput(`Math.log(${NUM})`);
      case 'log':
        return util.numberInput(`(Math.log(${NUM}) / Math.LN10)`);
      case 'e ^':
        return util.numberInput(`Math.exp(${NUM})`);
      case '10 ^':
        return util.numberInput(`Math.exp(${NUM} * Math.LN10)`);
      default:
        return util.numberInput('0');
    }
  };
  inputLibrary['operator_mod'] = function(util) {
    const NUM1 = util.getInput('NUM1', 'number');
    const NUM2 = util.getInput('NUM2', 'number');
    return util.numberInput(`mod(${NUM1}, ${NUM2})`);
  };
  inputLibrary['operator_multiply'] = function(util) {
    const NUM1 = util.getInput('NUM1', 'number');
    const NUM2 = util.getInput('NUM2', 'number');
    return util.numberInput(`(${NUM1} * ${NUM2} || 0)`);
  };
  inputLibrary['operator_not'] = function(util) {
    const OPERAND = util.getInput('OPERAND', 'any');
    return util.booleanInput(`!${OPERAND}`);
  };
  inputLibrary['operator_or'] = function(util) {
    const OPERAND1 = util.getInput('OPERAND1', 'any');
    const OPERAND2 = util.getInput('OPERAND2', 'any');
    return util.booleanInput(`(${OPERAND1} || ${OPERAND2})`);
  };
  inputLibrary['operator_random'] = function(util) {
    const FROM = util.getInput('FROM', 'number');
    const TO = util.getInput('TO', 'number');
    return util.numberInput(`random(${FROM}, ${TO})`);
  };
  inputLibrary['operator_round'] = function(util) {
    const NUM = util.getInput('NUM', 'number');
    return util.numberInput(`Math.round(${NUM})`);
  };
  inputLibrary['operator_subtract'] = function(util) {
    const NUM1 = util.getInput('NUM1', 'number');
    const NUM2 = util.getInput('NUM2', 'number');
    return util.numberInput(`(${NUM1} - ${NUM2} || 0)`);
  };
  inputLibrary['pen_menu_colorParam'] = function(util) {
    return util.fieldInput('colorParam');
  };
  inputLibrary['sensing_answer'] = function(util) {
    return util.stringInput('self.answer');
  };
  inputLibrary['sensing_coloristouchingcolor'] = function(util) {
    const COLOR = util.getInput('COLOR', 'any');
    const COLOR2 = util.getInput('COLOR2', 'any');
    return util.booleanInput(`S.colorTouchingColor(${COLOR}, ${COLOR2})`);
  };
  inputLibrary['sensing_current'] = function(util) {
    const CURRENTMENU = util.getField('CURRENTMENU').toLowerCase();
    switch (CURRENTMENU) {
      case 'year': return util.numberInput('new Date().getFullYear()');
      case 'month': return util.numberInput('(new Date().getMonth() + 1)');
      case 'date': return util.numberInput('new Date().getDate()');
      case 'dayofweek': return util.numberInput('(new Date().getDay() + 1)');
      case 'hour': return util.numberInput('new Date().getHours()');
      case 'minute': return util.numberInput('new Date().getMinutes()');
      case 'second': return util.numberInput('new Date().getSeconds()');
    }
    return util.numberInput('0');
  };
  inputLibrary['sensing_dayssince2000'] = function(util) {
    return util.numberInput('((Date.now() - epoch) / 86400000)');
  };
  inputLibrary['sensing_distanceto'] = function(util) {
    const DISTANCETOMENU = util.getInput('DISTANCETOMENU', 'any');
    return util.numberInput(`S.distanceTo(${DISTANCETOMENU})`);
  };
  inputLibrary['sensing_distancetomenu'] = function(util) {
    return util.fieldInput('DISTANCETOMENU');
  };
  inputLibrary['sensing_keyoptions'] = function(util) {
    return util.fieldInput('KEY_OPTION');
  };
  inputLibrary['sensing_keypressed'] = function(util) {
    const KEY_OPTION = util.getInput('KEY_OPTION', 'any');
    return util.booleanInput(`!!self.keys[P.runtime.getKeyCode(${KEY_OPTION})]`);
  };
  inputLibrary['sensing_loud'] = function(util) {
    // see sensing_loudness above
    return util.booleanInput('false');
  };
  inputLibrary['sensing_loudness'] = function(util) {
    // We don't implement loudness, we always return -1 which indicates that there is no microphone available.
    return util.numberInput('-1');
  };
  inputLibrary['sensing_mousedown'] = function(util) {
    return util.booleanInput('self.mousePressed');
  };
  inputLibrary['sensing_mousex'] = function(util) {
    return util.numberInput('self.mouseX');
  };
  inputLibrary['sensing_mousey'] = function(util) {
    return util.numberInput('self.mouseY');
  };
  inputLibrary['sensing_of'] = function(util) {
    const PROPERTY = util.sanitizedString(util.getField('PROPERTY'));
    const OBJECT = util.getInput('OBJECT', 'string');
    return util.anyInput(`attribute(${PROPERTY}, ${OBJECT})`);
  };
  inputLibrary['sensing_of_object_menu'] = function(util) {
    return util.fieldInput('OBJECT');
  };
  inputLibrary['sensing_timer'] = function(util) {
    if (P.config.preciseTimers) {
      return util.numberInput('((runtime.rightNow() - runtime.timerStart) / 1000)');
    } else {
      return util.numberInput('((runtime.now - runtime.timerStart) / 1000)');
    }
  };
  inputLibrary['sensing_touchingcolor'] = function(util) {
    const COLOR = util.getInput('COLOR', 'any');
    return util.booleanInput(`S.touchingColor(${COLOR})`);
  };
  inputLibrary['sensing_touchingobject'] = function(util) {
    const TOUCHINGOBJECTMENU = util.getInput('TOUCHINGOBJECTMENU', 'string');
    return util.booleanInput(`S.touching(${TOUCHINGOBJECTMENU})`);
  };
  inputLibrary['sensing_touchingobjectmenu'] = function(util) {
    return util.fieldInput('TOUCHINGOBJECTMENU');
  };
  inputLibrary['sound_sounds_menu'] = function(util) {
    return util.fieldInput('SOUND_MENU');
  };
  inputLibrary['sensing_username'] = function(util) {
    return util.stringInput('self.username');
  };
  inputLibrary['sound_volume'] = function(util) {
    return util.numberInput('(S.volume * 100)');
  };

  // Legacy no-ops
  // https://github.com/LLK/scratch-vm/blob/bb42c0019c60f5d1947f3432038aa036a0fddca6/src/blocks/scratch3_sensing.js#L74
  // https://github.com/LLK/scratch-vm/blob/bb42c0019c60f5d1947f3432038aa036a0fddca6/src/blocks/scratch3_motion.js#L42-L43
  const noopInput = (util: P.sb3.compiler2.InputUtil) => util.anyInput('undefined');
  inputLibrary['sensing_userid'] = noopInput;
  inputLibrary['motion_xscroll'] = noopInput;
  inputLibrary['motion_yscroll'] = noopInput;

  /* Hats */
  hatLibrary['control_start_as_clone'] = {
    handle(util) {
      util.target.listeners.whenCloned.push(util.startingFunction);
    },
  };
  hatLibrary['event_whenbackdropswitchesto'] = {
    handle(util) {
      const BACKDROP = util.getField('BACKDROP');
      if (!util.target.listeners.whenBackdropChanges[BACKDROP]) {
        util.target.listeners.whenBackdropChanges[BACKDROP] = [];
      }
      util.target.listeners.whenBackdropChanges[BACKDROP].push(util.startingFunction);
    },
  };
  hatLibrary['event_whenbroadcastreceived'] = {
    handle(util) {
      const BROADCAST_OPTION = util.getField('BROADCAST_OPTION').toLowerCase();
      if (!util.target.listeners.whenIReceive[BROADCAST_OPTION]) {
        util.target.listeners.whenIReceive[BROADCAST_OPTION] = [];
      }
      util.target.listeners.whenIReceive[BROADCAST_OPTION].push(util.startingFunction);
    },
  };
  hatLibrary['event_whenflagclicked'] = {
    handle(util) {
      util.target.listeners.whenGreenFlag.push(util.startingFunction);
    },
  };
  hatLibrary['event_whenkeypressed'] = {
    handle(util) {
      const KEY_OPTION = util.getField('KEY_OPTION');
      if (KEY_OPTION === 'any') {
        for (var i = 128; i--;) {
          util.target.listeners.whenKeyPressed[i].push(util.startingFunction);
        }
      } else {
        util.target.listeners.whenKeyPressed[P.runtime.getKeyCode(KEY_OPTION)].push(util.startingFunction);
      }
    },
  };
  hatLibrary['event_whenstageclicked'] = {
    handle(util) {
      util.target.listeners.whenClicked.push(util.startingFunction);
    },
  };
  hatLibrary['event_whenthisspriteclicked'] = {
    handle(util) {
      util.target.listeners.whenClicked.push(util.startingFunction);
    },
  };
  hatLibrary['makeymakey_whenMakeyKeyPressed'] = {
    handle(util) {
      // TODO: support all other keys
      // TODO: support patterns
      // Will probably be implemented as a very *interesting* "when any key pressed" handler
      // TODO: support all inputs
      const KEY = util.getInput('KEY', 'any');
      const keyMap = {
        // The key will be a full expression, including quotes around strings.
        '"SPACE"': 'space',
        '"UP"': 'up arrow',
        '"DOWN"': 'down arrow',
        '"LEFT"': 'left arrow',
        '"RIGHT"': 'right arrow',
        '"w"': 'w',
        '"a"': 'a',
        '"s"': 's',
        '"d"': 'd',
        '"f"': 'f',
        '"g"': 'g',
      };
      if (keyMap.hasOwnProperty(KEY)) {
        const keyCode = P.runtime.getKeyCode(keyMap[KEY]);
        util.target.listeners.whenKeyPressed[keyCode].push(util.startingFunction);
      } else {
        console.warn('unknown makey makey key', KEY);
      }
    },
  };
  hatLibrary['procedures_definition'] = {
    handle(util) {
      // TODO: HatUtil helpers for this

      const customBlockId = util.block.inputs.custom_block[1];
      const mutation = util.compiler.blocks[customBlockId].mutation;

      const proccode = mutation.proccode;
      // Warp is either a boolean or a string representation of that boolean for some reason.
      const warp = typeof mutation.warp === 'string' ? mutation.warp === 'true' : mutation.warp;
      // It's a stringified JSON array.
      const argumentNames = JSON.parse(mutation.argumentnames);

      const procedure = new P.sb3.Scratch3Procedure(util.startingFunction, warp, argumentNames);
      util.target.procedures[proccode] = procedure;
    },
    preprocess(compiler, source) {
      return source + 'endCall(); return;\n';
    },
  };

}());
