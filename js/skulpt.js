/**
 * @fileOverview A JavaScript/GLSL sculpting script for sculpting Three.js meshes
 * @author Skeel Lee <skeel@skeelogy.com>
 * @version 1.0.2
 *
 * @example
 * //How to setup a GPU Skulpt:
 *
 * //create a plane for sculpting
 * var TERRAIN_SIZE = 10;
 * var TERRAIN_RES = 256;
 * var terrainGeom = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_RES - 1, TERRAIN_RES - 1);
 * terrainGeom.applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
 * var terrainMesh = new THREE.Mesh(terrainGeom, null);  //a custom material will be assigned later when using SKULPT.GpuSkulpt
 * scene.add(terrainMesh);
 *
 * //create a GpuSkulpt instance
 * var gpuSkulpt = new SKULPT.GpuSkulpt({
 *     renderer: renderer,
 *     mesh: terrainMesh,
 *     size: TERRAIN_SIZE,
 *     res: TERRAIN_RES
 * });
 *
 * //update every frame
 * renderer.clear();
 * gpuSkulpt.update(dt);  //have to do this after clear but before render
 * renderer.render(scene, camera);
 *
 * @example
 * //How to sculpt:
 *
 * //get sculpt position and show/hide cursor
 * var sculptPosition = getSculptPosition();  //do ray-intersection tests, for example, to determine where the user is clicking on the plane
 * if (sculptPosition) {
 *     gpuSkulpt.updateCursor(sculptPosition);
 *     gpuSkulpt.showCursor();
 * } else {
 *     gpuSkulpt.hideCursor();
 * }
 *
 * //sculpt
 * var sculptType = SKULPT.ADD;
 * var sculptAmount = 1.0;
 * gpuSkulpt.sculpt(sculptType, sculptPosition, sculptAmount);
 *
 * @example
 * //How to clear sculpts:
 *
 * //clear sculpts
 * gpuSkulpt.clear();
 *
 * @example
 * //How to change sculpt brush parameters:
 *
 * //change brush size
 * var brushSize = 1.0;
 * gpuSkulpt.setBrushSize(brushSize);
 *
 * //change brush amount
 * var brushAmount = 1.0;
 * gpuSkulpt.setBrushAmount(brushAmount);
 *
 * @example
 * //How to load sculpt data from an img:
 *
 * //get image data from canvas
 * var canvas = document.createElement('canvas');
 * var context = canvas.getContext('2d');
 * var img = document.getElementById('yourImageId');
 * context.drawImage(img, 0, 0, TERRAIN_RES, TERRAIN_RES);
 * var terrainImageData = context.getImageData(0, 0, TERRAIN_RES, TERRAIN_RES).data;
 *
 * //load sculpt using image data
 * var height = 1.0;
 * var midGreyIsLowest = false;
 * gpuSkulpt.loadFromImageData(terrainImageData, height, midGreyIsLowest);
 */

/**
 * @namespace
 */
var SKULPT = SKULPT || { version: '1.0.2' };
console.log('Using SKULPT ' + SKULPT.version);

/**
 * Creates a GpuSkulpt instance for sculpting
 * @constructor
 * @param {object} options Options
 * @param {THREE.WebGLRenderer} options.renderer Three.js WebGL renderer
 * @param {THREE.Mesh} options.mesh Three.js mesh for sculpting
 * @param {number} options.size size of mesh
 * @param {number} options.res resolution of mesh
 * @param {number} [options.proxyRes] resolution of proxy mesh
 */
SKULPT.GpuSkulpt = function (options) {

    if (typeof options.mesh === 'undefined') {
        throw new Error('mesh not specified');
    }
    this.__mesh = options.mesh;
    if (typeof options.renderer === 'undefined') {
        throw new Error('renderer not specified');
    }
    this.__renderer = options.renderer;
    if (typeof options.size === 'undefined') {
        throw new Error('size not specified');
    }
    this.__size = options.size;
    this.__halfSize = this.__size / 2.0;
    if (typeof options.res === 'undefined') {
        throw new Error('res not specified');
    }
    this.__res = options.res;
    this.__proxyRes = options.proxyRes || this.__res;

    this.__actualToProxyRatio = this.__res / this.__proxyRes;
    this.__gridSize = this.__size / this.__res;
    this.__texelSize = 1.0 / this.__res;

    this.__imageProcessedData = new Float32Array(4 * this.__res * this.__res);

    this.__isSculpting = false;
    this.__sculptUvPos = new THREE.Vector2();

    this.__cursorHoverColor = new THREE.Vector3(0.4, 0.4, 0.4);
    this.__cursorAddColor = new THREE.Vector3(0.3, 0.5, 0.1);
    this.__cursorRemoveColor = new THREE.Vector3(0.5, 0.2, 0.1);

    this.__shouldClear = false;

    this.__linearFloatRgbParams = {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        format: THREE.RGBFormat,
        stencilBuffer: false,
        depthBuffer: false,
        type: THREE.FloatType
    };

    this.__nearestFloatRgbParams = {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        format: THREE.RGBFormat,
        stencilBuffer: false,
        depthBuffer: false,
        type: THREE.FloatType
    };

    this.__nearestFloatRgbaParams = {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        format: THREE.RGBAFormat,
        stencilBuffer: false,
        depthBuffer: false,
        type: THREE.FloatType
    };

    this.__pixelByteData = new Uint8Array(this.__res * this.__res * 4);
    this.__proxyPixelByteData = new Uint8Array(this.__proxyRes * this.__proxyRes * 4);

    this.__callbacks = {};

    this.__init();
};
SKULPT.GpuSkulpt.prototype.__shaders = {

    vert: {

        passUv: [

            //Pass-through vertex shader for passing interpolated UVs to fragment shader

            "varying vec2 vUv;",

            "void main() {",
                "vUv = vec2(uv.x, uv.y);",
                "gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
            "}"

        ].join('\n'),

        heightMap: [

            //Vertex shader that displaces vertices in local Y based on a texture

            "uniform sampler2D uTexture;",
            "uniform vec2 uTexelSize;",
            "uniform vec2 uTexelWorldSize;",
            "uniform float uHeightMultiplier;",

            "varying vec3 vViewPos;",
            "varying vec3 vViewNormal;",
            "varying vec2 vUv;",

            THREE.ShaderChunk['shadowmap_pars_vertex'],

            "void main() {",

                "vUv = uv;",

                //displace y based on texel value
                "vec4 t = texture2D(uTexture, vUv) * uHeightMultiplier;",
                "vec3 displacedPos = vec3(position.x, t.r, position.z);",

                //find normal
                "vec2 du = vec2(uTexelSize.r, 0.0);",
                "vec2 dv = vec2(0.0, uTexelSize.g);",
                "vec3 vecPosU = vec3(displacedPos.x + uTexelWorldSize.r,",
                                    "texture2D(uTexture, vUv + du).r * uHeightMultiplier,",
                                    "displacedPos.z) - displacedPos;",
                "vec3 vecNegU = vec3(displacedPos.x - uTexelWorldSize.r,",
                                    "texture2D(uTexture, vUv - du).r * uHeightMultiplier,",
                                    "displacedPos.z) - displacedPos;",
                "vec3 vecPosV = vec3(displacedPos.x,",
                                    "texture2D(uTexture, vUv + dv).r * uHeightMultiplier,",
                                    "displacedPos.z - uTexelWorldSize.g) - displacedPos;",
                "vec3 vecNegV = vec3(displacedPos.x,",
                                    "texture2D(uTexture, vUv - dv).r * uHeightMultiplier,",
                                    "displacedPos.z + uTexelWorldSize.g) - displacedPos;",
                "vViewNormal = normalize(normalMatrix * 0.25 * (cross(vecPosU, vecPosV) + cross(vecPosV, vecNegU) + cross(vecNegU, vecNegV) + cross(vecNegV, vecPosU)));",

                "vec4 worldPosition = modelMatrix * vec4(displacedPos, 1.0);",
                "vec4 viewPos = modelViewMatrix * vec4(displacedPos, 1.0);",
                "vViewPos = viewPos.rgb;",

                "gl_Position = projectionMatrix * viewPos;",

                THREE.ShaderChunk['shadowmap_vertex'],

            "}"

        ].join('\n')

    },

    frag: {

        skulpt: [

            //Fragment shader for sculpting

            "uniform sampler2D uBaseTexture;",
            "uniform sampler2D uSculptTexture1;",
            "uniform vec2 uTexelSize;",
            "uniform int uIsSculpting;",
            "uniform int uSculptType;",
            "uniform float uSculptAmount;",
            "uniform float uSculptRadius;",
            "uniform vec2 uSculptPos;",

            "varying vec2 vUv;",

            "float add(vec2 uv) {",
                "float len = length(uv - vec2(uSculptPos.x, 1.0 - uSculptPos.y));",
                "return uSculptAmount * smoothstep(uSculptRadius, 0.0, len);",
            "}",

            "void main() {",

                //r channel: height

                //read base texture
                "vec4 tBase = texture2D(uBaseTexture, vUv);",

                //read texture from previous step
                "vec4 t1 = texture2D(uSculptTexture1, vUv);",

                //add sculpt
                "if (uIsSculpting == 1) {",
                    "if (uSculptType == 1) {",  //add
                        "t1.r += add(vUv);",
                    "} else if (uSculptType == 2) {",  //remove
                        "t1.r -= add(vUv);",
                        "t1.r = max(0.0, tBase.r + t1.r) - tBase.r;",
                    "}",
                "}",

                //write out to texture for next step
                "gl_FragColor = t1;",
            "}"

        ].join('\n'),

        combineTextures: [

            //Fragment shader to combine textures

            "uniform sampler2D uTexture1;",
            "uniform sampler2D uTexture2;",

            "varying vec2 vUv;",

            "void main() {",
                "gl_FragColor = texture2D(uTexture1, vUv) + texture2D(uTexture2, vUv);",
            "}"

        ].join('\n'),

        setColor: [

            //Fragment shader to set colors on a render target

            "uniform vec4 uColor;",

            "void main() {",
                "gl_FragColor = uColor;",
            "}"

        ].join('\n'),

        scaleAndFlipV: [

            //Fragment shader to scale and flip a texture

            "uniform sampler2D uTexture;",
            "uniform float uScale;",

            "varying vec2 vUv;",

            "void main() {",
                "vec2 scaledAndFlippedUv = vec2(vUv.x * uScale, 1.0 - (vUv.y * uScale));",
                "gl_FragColor = texture2D(uTexture, scaledAndFlippedUv);",
            "}"

        ].join('\n'),

        encodeFloat: [

            //Fragment shader that encodes float value in input R channel to 4 unsigned bytes in output RGBA channels
            //Most of this code is from original GLSL codes from Piotr Janik, only slight modifications are done to fit the needs of this script
            //http://concord-consortium.github.io/lab/experiments/webgl-gpgpu/script.js
            //Using method 1 of the code.

            "uniform sampler2D uTexture;",
            "uniform vec4 uChannelMask;",

            "varying vec2 vUv;",

            "float shift_right(float v, float amt) {",
                "v = floor(v) + 0.5;",
                "return floor(v / exp2(amt));",
            "}",

            "float shift_left(float v, float amt) {",
                "return floor(v * exp2(amt) + 0.5);",
            "}",

            "float mask_last(float v, float bits) {",
                "return mod(v, shift_left(1.0, bits));",
            "}",

            "float extract_bits(float num, float from, float to) {",
                "from = floor(from + 0.5);",
                "to = floor(to + 0.5);",
                "return mask_last(shift_right(num, from), to - from);",
            "}",

            "vec4 encode_float(float val) {",

                "if (val == 0.0) {",
                    "return vec4(0, 0, 0, 0);",
                "}",

                "float sign = val > 0.0 ? 0.0 : 1.0;",
                "val = abs(val);",
                "float exponent = floor(log2(val));",
                "float biased_exponent = exponent + 127.0;",
                "float fraction = ((val / exp2(exponent)) - 1.0) * 8388608.0;",

                "float t = biased_exponent / 2.0;",
                "float last_bit_of_biased_exponent = fract(t) * 2.0;",
                "float remaining_bits_of_biased_exponent = floor(t);",

                "float byte4 = extract_bits(fraction, 0.0, 8.0) / 255.0;",
                "float byte3 = extract_bits(fraction, 8.0, 16.0) / 255.0;",
                "float byte2 = (last_bit_of_biased_exponent * 128.0 + extract_bits(fraction, 16.0, 23.0)) / 255.0;",
                "float byte1 = (sign * 128.0 + remaining_bits_of_biased_exponent) / 255.0;",

                "return vec4(byte4, byte3, byte2, byte1);",
            "}",

            "void main() {",
                "vec4 t = texture2D(uTexture, vUv);",
                "gl_FragColor = encode_float(dot(t, uChannelMask));",
            "}"

        ].join('\n'),

        lambertCursor: [

            //Fragment shader that does basic lambert shading.
            //This is the version that overlays a circular cursor patch.

            "uniform vec3 uBaseColor;",
            "uniform vec3 uAmbientLightColor;",
            "uniform float uAmbientLightIntensity;",

            "uniform int uShowCursor;",
            "uniform vec2 uCursorPos;",
            "uniform float uCursorRadius;",
            "uniform vec3 uCursorColor;",

            "varying vec3 vViewPos;",
            "varying vec3 vViewNormal;",
            "varying vec2 vUv;",

            "#if MAX_DIR_LIGHTS > 0",
                "uniform vec3 directionalLightColor[ MAX_DIR_LIGHTS ];",
                "uniform vec3 directionalLightDirection[ MAX_DIR_LIGHTS ];",
            "#endif",

            THREE.ShaderChunk['shadowmap_pars_fragment'],

            "void main() {",

                //ambient component
                "vec3 ambient = uAmbientLightColor * uAmbientLightIntensity;",

                //diffuse component
                "vec3 diffuse = vec3(0.0);",

                "#if MAX_DIR_LIGHTS > 0",

                    "for (int i = 0; i < MAX_DIR_LIGHTS; i++) {",
                        "vec4 lightVector = viewMatrix * vec4(directionalLightDirection[i], 0.0);",
                        "float normalModulator = dot(normalize(vViewNormal), normalize(lightVector.xyz));",
                        "diffuse += normalModulator * directionalLightColor[i];",
                    "}",

                "#endif",

                //combine components to get final color
                "vec3 finalColor = uBaseColor * (ambient + diffuse);",

                //mix in cursor color
                "if (uShowCursor == 1) {",
                    "float len = length(vUv - vec2(uCursorPos.x, 1.0 - uCursorPos.y));",
                    "finalColor = mix(finalColor, uCursorColor, smoothstep(uCursorRadius, 0.0, len));",
                "}",

                "gl_FragColor = vec4(finalColor, 1.0);",

                THREE.ShaderChunk['shadowmap_fragment'],

            "}"

        ].join('\n')

    }

};
/**
 * Gets the color of the cursor in hover mode
 * @return {THREE.Vector3} A vector that represents the color of the cursor in hover mode
 */
SKULPT.GpuSkulpt.prototype.getCursorHoverColor = function (r, g, b) {
    return this.__cursorHoverColor;
};
/**
 * Sets the color of the cursor in hover mode
 * @param {number} r Red floating-point value between 0 and 1, inclusive
 * @param {number} g Green floating-point value between 0 and 1, inclusive
 * @param {number} b Blue floating-point value between 0 and 1, inclusive
 */
SKULPT.GpuSkulpt.prototype.setCursorHoverColor = function (r, g, b) {
    this.__cursorHoverColor.copy(r, g, b);
};
/**
 * Gets the color of the cursor in add mode
 * @return {THREE.Vector3} A vector that represents the color of the cursor in add mode
 */
SKULPT.GpuSkulpt.prototype.getCursorAddColor = function (r, g, b) {
    return this.__cursorAddColor;
};
/**
 * Sets the color of the cursor in add mode
 * @param {number} r Red floating-point value between 0 and 1, inclusive
 * @param {number} g Green floating-point value between 0 and 1, inclusive
 * @param {number} b Blue floating-point value between 0 and 1, inclusive
 */
SKULPT.GpuSkulpt.prototype.setCursorAddColor = function (r, g, b) {
    this.__cursorAddColor.copy(r, g, b);
};
/**
 * Gets the color of the cursor in remove mode
 * @return {THREE.Vector3} A vector that represents the color of the cursor in remove mode
 */
SKULPT.GpuSkulpt.prototype.getCursorRemoveColor = function (r, g, b) {
    return this.__cursorRemoveColor;
};
/**
 * Sets the color of the cursor in remove mode
 * @param {number} r Red floating-point value between 0 and 1, inclusive
 * @param {number} g Green floating-point value between 0 and 1, inclusive
 * @param {number} b Blue floating-point value between 0 and 1, inclusive
 */
SKULPT.GpuSkulpt.prototype.setCursorRemoveColor = function (r, g, b) {
    this.__cursorRemoveColor.copy(r, g, b);
};
SKULPT.GpuSkulpt.prototype.__init = function () {

    this.__checkExtensions();
    this.__setupRttScene();

    //setup a reset material for clearing render targets
    this.__clearMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uColor: { type: 'v4', value: new THREE.Vector4() }
        },
        vertexShader: this.__shaders.vert['passUv'],
        fragmentShader: this.__shaders.frag['setColor']
    });

    this.__setupRttRenderTargets();
    this.__setupShaders();
    this.__setupVtf();

    //create a DataTexture, with filtering type based on whether linear filtering is available
    if (this.__supportsTextureFloatLinear) {
        //use linear with mipmapping
        this.__imageDataTexture = new THREE.DataTexture(null, this.__res, this.__res, THREE.RGBAFormat, THREE.FloatType, undefined, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping, THREE.LinearFilter, THREE.LinearMipMapLinearFilter);
        this.__imageDataTexture.generateMipmaps = true;
    } else {
        //resort to nearest filter only, without mipmapping
        this.__imageDataTexture = new THREE.DataTexture(null, this.__res, this.__res, THREE.RGBAFormat, THREE.FloatType, undefined, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping, THREE.NearestFilter, THREE.NearestFilter);
        this.__imageDataTexture.generateMipmaps = false;
    }
};
SKULPT.GpuSkulpt.prototype.__checkExtensions = function (renderer) {
    var context = this.__renderer.context;

    //determine floating point texture support
    //https://www.khronos.org/webgl/public-mailing-list/archives/1306/msg00002.html

    //get floating point texture support
    if (!context.getExtension('OES_texture_float')) {
        var msg = 'No support for floating point textures. Extension not available: OES_texture_float';
        alert(msg);
        throw new Error(msg);
    }

    //get floating point linear filtering support
    this.__supportsTextureFloatLinear = context.getExtension('OES_texture_float_linear') !== null;
    console.log('Texture float linear filtering support: ' + this.__supportsTextureFloatLinear);

    //get vertex texture support
    if (!context.getParameter(context.MAX_VERTEX_TEXTURE_IMAGE_UNITS)) {
        var msg = 'Vertex textures not supported on your graphics card';
        alert(msg);
        throw new Error(msg);
    }
};
SKULPT.GpuSkulpt.prototype.__setupShaders = function () {

    this.__skulptMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uBaseTexture: { type: 't', value: null },
            uSculptTexture1: { type: 't', value: null },
            uTexelSize: { type: 'v2', value: new THREE.Vector2(this.__texelSize, this.__texelSize) },
            uTexelWorldSize: { type: 'v2', value: new THREE.Vector2(this.__size / this.__res, this.__size / this.__res) },
            uIsSculpting: { type: 'i', value: 0 },
            uSculptType: { type: 'i', value: 0 },
            uSculptPos: { type: 'v2', value: new THREE.Vector2() },
            uSculptAmount: { type: 'f', value: 0.05 },
            uSculptRadius: { type: 'f', value: 0.0 }
        },
        vertexShader: this.__shaders.vert['passUv'],
        fragmentShader: this.__shaders.frag['skulpt']
    });

    this.__combineTexturesMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture1: { type: 't', value: null },
            uTexture2: { type: 't', value: null }
        },
        vertexShader: this.__shaders.vert['passUv'],
        fragmentShader: this.__shaders.frag['combineTextures']
    });

    this.__rttEncodeFloatMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: null },
            uChannelMask: { type: 'v4', value: new THREE.Vector4() }
        },
        vertexShader: this.__shaders.vert['passUv'],
        fragmentShader: this.__shaders.frag['encodeFloat']
    });

    this.__rttProxyMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: null },
            uScale: { type: 'f', value: 0 }
        },
        vertexShader: this.__shaders.vert['passUv'],
        fragmentShader: this.__shaders.frag['scaleAndFlipV']
    });

    this.__channelVectors = {
        'r': new THREE.Vector4(1, 0, 0, 0),
        'g': new THREE.Vector4(0, 1, 0, 0),
        'b': new THREE.Vector4(0, 0, 1, 0),
        'a': new THREE.Vector4(0, 0, 0, 1)
    };
};
//Sets up the render-to-texture scene (2 render targets for accumulative feedback)
SKULPT.GpuSkulpt.prototype.__setupRttScene = function () {

    //create a RTT scene
    this.__rttScene = new THREE.Scene();

    //create an orthographic RTT camera
    var far = 10000;
    var near = -far;
    this.__rttCamera = new THREE.OrthographicCamera(-this.__halfSize, this.__halfSize, this.__halfSize, -this.__halfSize, near, far);

    //create a quad which we will use to invoke the shaders
    this.__rttQuadGeom = new THREE.PlaneGeometry(this.__size, this.__size);
    this.__rttQuadMesh = new THREE.Mesh(this.__rttQuadGeom, this.__skulptMaterial);
    this.__rttScene.add(this.__rttQuadMesh);
};
SKULPT.GpuSkulpt.prototype.__setupRttRenderTargets = function () {

    //create RTT render targets (we need two to do feedback)
    if (this.__supportsTextureFloatLinear) {
        this.__rttRenderTarget1 = new THREE.WebGLRenderTarget(this.__res, this.__res, this.__linearFloatRgbParams);
    } else {
        this.__rttRenderTarget1 = new THREE.WebGLRenderTarget(this.__res, this.__res, this.__nearestFloatRgbParams);
    }
    this.__rttRenderTarget1.generateMipmaps = false;
    this.__clearRenderTarget(this.__rttRenderTarget1, 0.0, 0.0, 0.0, 0.0);  //clear render target (necessary for FireFox)
    this.__rttRenderTarget2 = this.__rttRenderTarget1.clone();
    this.__clearRenderTarget(this.__rttRenderTarget2, 0.0, 0.0, 0.0, 0.0);  //clear render target (necessary for FireFox)

    //create a RTT render target for storing the combine results of all layers
    this.__rttCombinedLayer = this.__rttRenderTarget1.clone();
    this.__clearRenderTarget(this.__rttCombinedLayer, 0.0, 0.0, 0.0, 0.0);  //clear render target (necessary for FireFox)

    //create RTT render target for storing proxy terrain data
    if (this.__supportsTextureFloatLinear) {
        this.__rttProxyRenderTarget = new THREE.WebGLRenderTarget(this.__proxyRes, this.__proxyRes, this.__linearFloatRgbParams);
    } else {
        this.__rttProxyRenderTarget = new THREE.WebGLRenderTarget(this.__proxyRes, this.__proxyRes, this.__nearestFloatRgbParams);
    }
    this.__rttProxyRenderTarget.generateMipmaps = false;
    this.__clearRenderTarget(this.__rttProxyRenderTarget, 0.0, 0.0, 0.0, 0.0);  //clear render target (necessary for FireFox)

    //create another RTT render target encoding float to 4-byte data
    this.__rttFloatEncoderRenderTarget = new THREE.WebGLRenderTarget(this.__res, this.__res, this.__nearestFloatRgbaParams);
    this.__rttFloatEncoderRenderTarget.generateMipmaps = false;
    this.__clearRenderTarget(this.__rttFloatEncoderRenderTarget, 0.0, 0.0, 0.0, 0.0);  //clear render target (necessary for FireFox)
};
SKULPT.GpuSkulpt.prototype.__clearRenderTarget = function (renderTarget, r, g, b, a) {
    this.__rttQuadMesh.material = this.__clearMaterial;
    this.__clearMaterial.uniforms['uColor'].value.set(r, g, b, a);
    this.__renderer.render(this.__rttScene, this.__rttCamera, renderTarget, false);
};
//Sets up the vertex-texture-fetch for the given mesh
SKULPT.GpuSkulpt.prototype.__setupVtf = function () {
    this.__mesh.material = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([
            THREE.UniformsLib['lights'],
            THREE.UniformsLib['shadowmap'],
            {
                uTexture: { type: 't', value: null },
                uTexelSize: { type: 'v2', value: new THREE.Vector2(1.0 / this.__res, 1.0 / this.__res) },
                uTexelWorldSize: { type: 'v2', value: new THREE.Vector2(this.__gridSize, this.__gridSize) },
                uHeightMultiplier: { type: 'f', value: 1.0 },
                uBaseColor: { type: 'v3', value: new THREE.Vector3(0.6, 0.8, 0.0) },
                uShowCursor: { type: 'i', value: 0 },
                uCursorPos: { type: 'v2', value: new THREE.Vector2() },
                uCursorRadius: { type: 'f', value: 0.0 },
                uCursorColor: { type: 'v3', value: new THREE.Vector3() }
            }
        ]),
        vertexShader: this.__shaders.vert['heightMap'],
        fragmentShader: this.__shaders.frag['lambertCursor'],
        lights: true
    });
};
/**
 * Updates the skulpt<br/><strong>NOTE:  This needs to be called every frame, after renderer.clear() and before renderer.render(...)</strong>
 * @param {number} dt Elapsed time since previous frame
 */
SKULPT.GpuSkulpt.prototype.update = function (dt) {

    //have to set flags from other places and then do all steps at once during update

    //clear sculpts if necessary
    if (this.__shouldClear) {
        this.__rttQuadMesh.material = this.__clearMaterial;
        this.__clearMaterial.uniforms['uColor'].value.set(0.0, 0.0, 0.0, 0.0);
        this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttRenderTarget1, false);
        this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttRenderTarget2, false);
        this.__shouldClear = false;
        this.__updateCombinedLayers = true;
    }

    //do the main sculpting
    if (this.__isSculpting) {
        this.__rttQuadMesh.material = this.__skulptMaterial;
        this.__skulptMaterial.uniforms['uBaseTexture'].value = this.__imageDataTexture;
        this.__skulptMaterial.uniforms['uSculptTexture1'].value = this.__rttRenderTarget2;
        this.__skulptMaterial.uniforms['uIsSculpting'].value = this.__isSculpting;
        this.__skulptMaterial.uniforms['uSculptPos'].value.copy(this.__sculptUvPos);
        this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttRenderTarget1, false);
        this.__swapRenderTargets();
        this.__isSculpting = false;
        this.__updateCombinedLayers = true;
    }

    //combine layers into one
    if (this.__updateCombinedLayers) {  //this can be triggered somewhere else without sculpting

        this.__rttQuadMesh.material = this.__combineTexturesMaterial;
        this.__combineTexturesMaterial.uniforms['uTexture1'].value = this.__imageDataTexture;
        this.__combineTexturesMaterial.uniforms['uTexture2'].value = this.__rttRenderTarget2;
        this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttCombinedLayer, false);
        this.__updateCombinedLayers = false;

        //need to rebind rttCombinedLayer to uTexture
        this.__mesh.material.uniforms['uTexture'].value = this.__rttCombinedLayer;

        //check for the callback of type 'update'
        if (this.__callbacks.hasOwnProperty('update')) {
            var renderCallbacks = this.__callbacks['update'];
            var i, len;
            for (i = 0, len = renderCallbacks.length; i < len; i++) {
                renderCallbacks[i]();
            }
        }
    }
};
SKULPT.GpuSkulpt.prototype.__swapRenderTargets = function () {
    var temp = this.__rttRenderTarget1;
    this.__rttRenderTarget1 = this.__rttRenderTarget2;
    this.__rttRenderTarget2 = temp;
    // this.__skulptMaterial.uniforms['uSculptTexture1'].value = this.__rttRenderTarget2;
};
/**
 * Sets brush size
 * @param {number} size Brush size
 */
SKULPT.GpuSkulpt.prototype.setBrushSize = function (size) {
    var normSize = size / (this.__size * 2.0);
    this.__skulptMaterial.uniforms['uSculptRadius'].value = normSize;
    this.__mesh.material.uniforms['uCursorRadius'].value = normSize;
};
/**
 * Sets brush amount
 * @param {number} amount Brush amount
 */
SKULPT.GpuSkulpt.prototype.setBrushAmount = function (amount) {
    this.__skulptMaterial.uniforms['uSculptAmount'].value = amount;
};
/**
 * Loads terrain heights from image data
 * @param  {array} data Image data from canvas
 * @param  {number} amount Height multiplier
 * @param  {boolean} midGreyIsLowest Whether mid grey is considered the lowest part of the image
 */
SKULPT.GpuSkulpt.prototype.loadFromImageData = function (data, amount, midGreyIsLowest) {

    //convert data from Uint8ClampedArray to Float32Array so that DataTexture can use
    var normalizedHeight;
    var min = 99999;
    var i, len;
    for (i = 0, len = this.__imageProcessedData.length; i < len; i++) {
        if (midGreyIsLowest) {
            normalizedHeight = Math.abs(data[i] / 255.0 - 0.5);
        } else {
            normalizedHeight = data[i] / 255.0;
        }
        this.__imageProcessedData[i] = normalizedHeight * amount;

        //store min
        if (this.__imageProcessedData[i] < min) {
            min = this.__imageProcessedData[i];
        }
    }

    //shift down so that min is at 0
    for (i = 0, len = this.__imageProcessedData.length; i < len; i++) {
        this.__imageProcessedData[i] -= min;
    }

    //assign data to DataTexture
    this.__imageDataTexture.image.data = this.__imageProcessedData;
    this.__imageDataTexture.needsUpdate = true;
    this.__skulptMaterial.uniforms['uBaseTexture'].value = this.__imageDataTexture;
    this.__combineTexturesMaterial.uniforms['uTexture1'].value = this.__imageDataTexture;
    // this.__mesh.material.uniforms['uBaseTexture'].value = this.__imageDataTexture;
    this.__updateCombinedLayers = true;
};
/**
 * Sculpt the terrain
 * @param  {enum} type Sculpt operation type: SKULPT.GpuSkulpt.ADD, SKULPT.GpuSkulpt.REMOVE
 * @param  {THREE.Vector3} position World-space position to sculpt at
 * @param  {number} amount Amount to sculpt
 */
SKULPT.GpuSkulpt.prototype.sculpt = function (type, position, amount) {
    this.__skulptMaterial.uniforms['uSculptType'].value = type;
    this.__isSculpting = true;
    this.__sculptUvPos.x = (position.x + this.__halfSize) / this.__size;
    this.__sculptUvPos.y = (position.z + this.__halfSize) / this.__size;
    if (type === 1) {
        this.__mesh.material.uniforms['uCursorColor'].value.copy(this.__cursorAddColor);
    } else if (type === 2) {
        this.__mesh.material.uniforms['uCursorColor'].value.copy(this.__cursorRemoveColor);
    }
};
/**
 * Clears all sculpts
 */
SKULPT.GpuSkulpt.prototype.clear = function () {
    this.__shouldClear = true;
};
/**
 * Updates the cursor position
 * @param  {THREE.Vector3} position World-space position to update the cursor to
 */
SKULPT.GpuSkulpt.prototype.updateCursor = function (position) {
    this.__sculptUvPos.x = (position.x + this.__halfSize) / this.__size;
    this.__sculptUvPos.y = (position.z + this.__halfSize) / this.__size;
    this.__mesh.material.uniforms['uCursorPos'].value.set(this.__sculptUvPos.x, this.__sculptUvPos.y);
    this.__mesh.material.uniforms['uCursorColor'].value.copy(this.__cursorHoverColor);
};
/**
 * Shows the sculpt cursor
 */
SKULPT.GpuSkulpt.prototype.showCursor = function () {
    this.__mesh.material.uniforms['uShowCursor'].value = 1;
};
/**
 * Hides the sculpt cursor
 */
SKULPT.GpuSkulpt.prototype.hideCursor = function () {
    this.__mesh.material.uniforms['uShowCursor'].value = 0;
};
/**
 * Gets the sculpt texture that is used for displacement of mesh
 * @return {THREE.WebGLRenderTarget} Sculpt texture that is used for displacement of mesh
 */
SKULPT.GpuSkulpt.prototype.getSculptDisplayTexture = function () {
    return this.__rttCombinedLayer;
};
//Returns the pixel unsigned byte data for the render target texture (readPixels() can only return unsigned byte data)
SKULPT.GpuSkulpt.prototype.__getPixelByteDataForRenderTarget = function (renderTarget, pixelByteData, width, height) {

    //I need to read in pixel data from WebGLRenderTarget but there seems to be no direct way.
    //Seems like I have to do some native WebGL stuff with readPixels().

    var gl = this.__renderer.getContext();

    //bind texture to gl context
    gl.bindFramebuffer(gl.FRAMEBUFFER, renderTarget.__webglFramebuffer);

    //attach texture
    // gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, renderTarget.__webglTexture, 0);

    //read pixels
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixelByteData);

    //unbind
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

};
SKULPT.GpuSkulpt.prototype.__getPixelEncodedByteData = function (renderTarget, pixelByteData, channelId, width, height) {

    //encode the float data into an unsigned byte RGBA texture
    this.__rttQuadMesh.material = this.__rttEncodeFloatMaterial;
    this.__rttEncodeFloatMaterial.uniforms['uTexture'].value = renderTarget;
    this.__rttEncodeFloatMaterial.uniforms['uChannelMask'].value.copy(this.__channelVectors[channelId]);
    this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttFloatEncoderRenderTarget, false);

    this.__getPixelByteDataForRenderTarget(this.__rttFloatEncoderRenderTarget, pixelByteData, width, height);
};
/**
 * Gets float data for every pixel of the terrain texture<br/><strong>NOTE: This is an expensive operation.</strong>
 * @return {Float32Array} Float data of every pixel of the terrain texture
 */
SKULPT.GpuSkulpt.prototype.getPixelFloatData = function () {

    //get the encoded byte data first
    this.__getPixelEncodedByteData(this.__rttCombinedLayer, this.__pixelByteData, 'r', this.__res, this.__res);

    //cast to float
    var pixelFloatData = new Float32Array(this.__pixelByteData.buffer);
    return pixelFloatData;
};
/**
 * Gets float data for every pixel of the proxy terrain texture<br/><strong>NOTE: This is an expensive operation.</strong>
 * @return {Float32Array} Float data of every pixel of the proxy terrain texture
 */
SKULPT.GpuSkulpt.prototype.getProxyPixelFloatData = function () {

    //render to proxy render target
    this.__rttQuadMesh.material = this.__rttProxyMaterial;
    this.__rttProxyMaterial.uniforms['uTexture'].value = this.__rttCombinedLayer;
    this.__rttProxyMaterial.uniforms['uScale'].value = this.__actualToProxyRatio;
    this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttProxyRenderTarget, false);

    //get the encoded byte data first
    this.__getPixelEncodedByteData(this.__rttProxyRenderTarget, this.__proxyPixelByteData, 'r', this.__proxyRes, this.__proxyRes);

    //cast to float
    var pixelFloatData = new Float32Array(this.__proxyPixelByteData.buffer);
    return pixelFloatData;
};
/**
 * Adds callback function that are executed at specific times
 * @param {string} type Type of callback: 'update' (only choice available now)
 * @param {function} callbackFn Callback function
 */
SKULPT.GpuSkulpt.prototype.addCallback = function (type, callbackFn) {
    if (!this.__callbacks.hasOwnProperty(type)) {
        this.__callbacks[type] = [];
    }
    if (callbackFn) {
        if (typeof callbackFn === 'function') {
            this.__callbacks[type].push(callbackFn);
        } else {
            throw new Error('Specified callbackFn is not a function');
        }
    } else {
        throw new Error('Callback function not defined');
    }
};

/**
 * Add sculpt operation
 * @const
 */
SKULPT.ADD = 1;
/**
 * Remove sculpt operation
 * @const
 */
SKULPT.REMOVE = 2;
