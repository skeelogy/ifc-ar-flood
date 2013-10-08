/**
 * @fileOverview GPU height field water simulations for Three.js flat planes
 * @author Skeel Lee <skeel@skeelogy.com>
 * @version 1.0.2
 *
 * @example
 * //How to setup a water sim:
 *
 * //create a plane as the water
 * var WATER_SIZE = 10;
 * var WATER_RES = 256;
 * waterGeom = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, WATER_RES - 1, WATER_RES - 1);
 * waterGeom.applyMatrix(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
 * waterMesh = new THREE.Mesh(waterGeom, null);  //a custom material will automatically be assigned later
 * scene.add(waterMesh);
 *
 * //create a GpuPipeModelWater instance (as an example)
 * var gpuWater = new SKUNAMI.GpuPipeModelWater({
 *     renderer: renderer,
 *     scene: scene,
 *     mesh: waterMesh,
 *     size: WATER_SIZE,
 *     res: WATER_RES,
 *     dampingFactor: 0.995,
 *     multisteps: 1
 * });
 *
 * //update every frame
 * renderer.clear();
 * gpuWater.update(dt);  //have to do this after clear but before render
 * renderer.render(scene, camera);
 *
 * @example
 * //How to interact with the water:
 *
 * //disturb (i.e. cause ripples on water surface)
 * var position = detectIntersection();  //do ray-intersection tests, for example, to determine where the user is clicking on the water plane
 * var waterDisturbAmount = 0.15;
 * var waterDisturbRadius = 0.25;
 * gpuWater.disturb(position, waterDisturbAmount, waterDisturbRadius);
 *
 * //source (i.e. add water to simulation, only available for GpuPipeModelWater)
 * var waterSourceAmount = 0.2;
 * var waterSourceRadius = 0.7;
 * gpuWater.source(position, waterSourceAmount, waterSourceRadius);
 *
 * //sink (i.e. remove water from simulation, only available for GpuPipeModelWater)
 * var waterSinkAmount = -0.5;
 * var waterSinkRadius = 0.7;
 * gpuWater.source(position, waterSinkAmount, waterSinkRadius);
 *
 * @example
 * //How to flood the scene over time:
 *
 * var floodRate = 10;  //cubic scene units per unit time
 *
 * //add some volume every frame
 * var dV = floodRate * dt;
 * gpuWater.flood(dV);
 */

/**
 * @namespace
 */
var SKUNAMI = SKUNAMI || { version: '1.0.2' };
console.log('Using SKUNAMI ' + SKUNAMI.version);

/**
 * Abstract base class for GPU height field water simulations
 * @constructor
 * @abstract
 */
SKUNAMI.GpuHeightFieldWater = function (options) {

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
    if (typeof options.scene === 'undefined') {
        throw new Error('scene not specified');
    }
    this.__scene = options.scene;
    if (typeof options.res === 'undefined') {
        throw new Error('res not specified');
    }
    this.__res = options.res;
    if (typeof options.dampingFactor === 'undefined') {
        throw new Error('dampingFactor not specified');
    }
    this.__dampingFactor = options.dampingFactor;

    //number of full steps to take per frame, to speed up some of algorithms that are slow to propagate at high mesh resolutions.
    //this is different from substeps which are reduces dt per step for stability.
    this.__multisteps = options.multisteps || 1;

    this.__shouldDisplayWaterTexture = false;
    this.__shouldDisplayObstaclesTexture = false;

    this.__gravity = 9.81;
    this.__density = options.density || 1000;  //default to 1000 kg per cubic metres

    this.__halfSize = this.__size / 2.0;
    this.__segmentSize = this.__size / this.__res;
    this.__segmentSizeSquared = this.__segmentSize * this.__segmentSize;
    this.__texelSize = 1.0 / this.__res;

    this.__disturbMapHasUpdated = false;
    this.__isDisturbing = false;
    this.__disturbUvPos = new THREE.Vector2();
    this.__disturbAmount = 0;
    this.__disturbRadius = 0.0025 * this.__size;

    this.__linearFloatRgbaParams = {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        wrapS: THREE.ClampToEdgeWrapping,
        wrapT: THREE.ClampToEdgeWrapping,
        format: THREE.RGBAFormat,
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

    //create a boundary texture
    this.__boundaryData = new Float32Array(4 * this.__res * this.__res);

    //camera depth range (for obstacles)
    this.__rttObstaclesCameraRange = 50.0;

    this.__pixelByteData = new Uint8Array(this.__res * this.__res * 4);

    this.__staticObstacles = [];
    this.__dynObstacles = [];
    this.__shouldUpdateStaticObstacle = false;

    this.__callbacks = {};

    this.__initCounter = 5;
    this.__init();

    //setup obstacles
    this.__setupObstaclesScene();
};
/**
 * Gets whether the water texture should be displayed
 * @returns {boolean} Whether the water texture should be displayed
 */
SKUNAMI.GpuHeightFieldWater.prototype.getShouldDisplayWaterTexture = function () {
    return this.__shouldDisplayWaterTexture;
};
/**
 * Sets whether the water texture should be displayed
 * @param {boolean} value Whether the water texture should be displayed
 */
SKUNAMI.GpuHeightFieldWater.prototype.setShouldDisplayWaterTexture = function (value) {
    this.__shouldDisplayWaterTexture = value;
};
/**
 * Gets whether the obstacles texture should be displayed
 * @returns {boolean} Whether the obstacles texture should be displayed
 */
SKUNAMI.GpuHeightFieldWater.prototype.getShouldDisplayObstaclesTexture = function () {
    return this.__shouldDisplayObstaclesTexture;
};
/**
 * Sets whether the obstacles texture should be displayed
 * @param {boolean} value Whether the obstacles texture should be displayed
 */
SKUNAMI.GpuHeightFieldWater.prototype.setShouldDisplayObstaclesTexture = function (value) {
    this.__shouldDisplayObstaclesTexture = value;
};
SKUNAMI.GpuHeightFieldWater.prototype.__init = function () {

    this.__checkExtensions();
    this.__setupRttScene();

    //setup a reset material for clearing render targets
    this.__resetMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uColor: { type: 'v4', value: new THREE.Vector4() }
        },
        vertexShader: this.__shaders.vert['passUv'],
        fragmentShader: this.__shaders.frag['setColor']
    });

    //create an empty texture because the default value of textures does not seem to be 0?
    if (this.__supportsTextureFloatLinear) {
        this.__emptyTexture = new THREE.WebGLRenderTarget(this.__res, this.__res, this.__linearFloatRgbaParams);
    } else {
        this.__emptyTexture = new THREE.WebGLRenderTarget(this.__res, this.__res, this.__nearestFloatRgbaParams);
    }
    this.__emptyTexture.generateMipmaps = false;
    this.__clearRenderTarget(this.__emptyTexture, 0.0, 0.0, 0.0, 0.0);

    //create a DataTexture for the boundary, with filtering type based on whether linear filtering is available
    if (this.__supportsTextureFloatLinear) {
        //use linear with mipmapping
        this.__boundaryTexture = new THREE.DataTexture(null, this.__res, this.__res, THREE.RGBAFormat, THREE.FloatType);
        this.__boundaryTexture.generateMipmaps = true;
    } else {
        //resort to nearest filter only, without mipmapping
        this.__boundaryTexture = new THREE.DataTexture(null, this.__res, this.__res, THREE.RGBAFormat, THREE.FloatType, undefined, THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping, THREE.NearestFilter, THREE.NearestFilter);
        this.__boundaryTexture.generateMipmaps = false;
    }
    this.__initDataAndTextures();

    this.__setupRttRenderTargets();
    this.__setupShaders();
    this.__setupVtf();

    //init parallel reducer
    this.__pr = new SKPR.ParallelReducer(this.__renderer, this.__res, 1);
};
SKUNAMI.GpuHeightFieldWater.prototype.__getWaterFragmentShaderContent = function () {
    throw new Error('Abstract method not implemented');
};
SKUNAMI.GpuHeightFieldWater.prototype.__shaders = {

    vert: {

        pass: [

            //Pass-through vertex shader for passing just the transformed position to fragment shader

            "void main() {",
                "gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
            "}"

        ].join('\n'),

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

        lambert: [

            "uniform vec3 uBaseColor;",
            "uniform vec3 uAmbientLightColor;",
            "uniform float uAmbientLightIntensity;",

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

                "gl_FragColor = vec4(uBaseColor * (ambient + diffuse), 1.0);",

                THREE.ShaderChunk['shadowmap_fragment'],

            "}"

        ].join('\n'),

        hfWater_disturb: [

            //Fragment shader for disturbing water simulations

            "uniform sampler2D uTexture;",
            "uniform sampler2D uStaticObstaclesTexture;",
            "uniform sampler2D uDisturbTexture;",
            "uniform int uUseObstacleTexture;",

            //disturb is masked by obstacles
            "uniform int uIsDisturbing;",
            "uniform float uDisturbAmount;",
            "uniform float uDisturbRadius;",
            "uniform vec2 uDisturbPos;",

            //source is not masked by obstacles
            "uniform int uIsSourcing;",
            "uniform float uSourceAmount;",
            "uniform float uSourceRadius;",
            "uniform vec2 uSourcePos;",

            //flood is source for every cell
            "uniform int uIsFlooding;",
            "uniform float uFloodAmount;",

            "varying vec2 vUv;",

            "void main() {",

                //read texture from previous step
                //r channel: height
                "vec4 t = texture2D(uTexture, vUv);",

                "float inObstacle;",
                "if (uUseObstacleTexture == 1) {",
                    "vec4 tObstacles = texture2D(uStaticObstaclesTexture, vUv);",
                    "inObstacle = tObstacles.r;",
                "} else {",
                    //if not using obstacle texture, it means we can just determine this info from the water height.
                    //no water means it is in obstacle.
                    "inObstacle = float(t.r < 0.0);",
                "}",

                //add disturb (will be masked by obstacles)
                "if (uIsDisturbing == 1) {",
                    "float len = length(vUv - vec2(uDisturbPos.x, 1.0 - uDisturbPos.y));",
                    "t.r += uDisturbAmount * (1.0 - smoothstep(0.0, uDisturbRadius, len)) * (1.0 - inObstacle);",
                "}",

                //add source (will not be masked by obstacles, otherwise if an area has no water, you can never source into it anymore)
                "if (uIsSourcing == 1) {",
                    "float len = length(vUv - vec2(uSourcePos.x, 1.0 - uSourcePos.y));",
                    "t.r += uSourceAmount * (1.0 - smoothstep(0.0, uSourceRadius, len));",
                "}",

                //read disturb texture and just add this amount into the system
                //r channel: disturb amount
                "vec4 tDisturb = texture2D(uDisturbTexture, vUv);",
                "t.r += tDisturb.r;",

                //add flood
                "if (uIsFlooding == 1) {",  //this is used for pipe model water only
                    "t.r += uFloodAmount;",
                "}",

                //write out to texture for next step
                "gl_FragColor = t;",
            "}"

        ].join('\n'),

        hfWater_muellerGdc2008: [

            //GPU version of "Fast Water Simulation for Games Using Height Fields" (Matthias Mueller-Fisher, GDC2008)

            //NOTE: I have added in mean height in the calculations, purely because of the flooding system.
            //It is not necessary if you do not need to rise the water level.

            "uniform sampler2D uTexture;",
            "uniform vec2 uTexelSize;",
            "uniform vec2 uTexelWorldSize;",
            "uniform float uDampingFactor;",
            "uniform float uHorizontalSpeed;",
            "uniform float uDt;",
            "uniform float uMeanHeight;",

            "varying vec2 vUv;",

            "void main() {",

                //r channel: height
                //g channel: vertical vel
                //b channel: UNUSED
                //a channel: prev mean height

                //read texture from previous step
                "vec4 t = texture2D(uTexture, vUv);",

                //remove previous mean height first to bring back to 0 height
                "t.r -= t.a;",

                //propagate
                "vec2 du = vec2(uTexelSize.r, 0.0);",
                "vec2 dv = vec2(0.0, uTexelSize.g);",
                "float acc = uHorizontalSpeed * uHorizontalSpeed * (",
                               "texture2D(uTexture,vUv+du).r",
                               "+ texture2D(uTexture,vUv-du).r",
                               "+ texture2D(uTexture,vUv+dv).r",
                               "+ texture2D(uTexture,vUv-dv).r",
                               "- 4.0 * t.a - 4.0 * t.r) / (uTexelWorldSize.x * uTexelWorldSize.x);",
                "t.g += acc * uDt;",  //TODO: use a better integrator
                "t.g *= uDampingFactor;",

                //update
                "t.r += t.g * uDt;",  //TODO: use a better integrator

                //add new mean height
                "t.r += uMeanHeight;",

                //store new mean height
                "t.a = uMeanHeight;",

                //write out to texture for next step
                "gl_FragColor = t;",
            "}"

        ].join('\n'),

        hfWater_muellerGdc2008Hw: [

            //GPU version of HelloWorld code of "Fast Water Simulation for Games Using Height Fields" (Matthias Mueller-Fisher, GDC2008)

            //NOTE: I have added in mean height in the calculations, purely because of the flooding system.
            //It is not necessary if you do not need to rise the water level.

            "uniform sampler2D uTexture;",
            "uniform vec2 uTexelSize;",
            "uniform float uDampingFactor;",
            "uniform float uMeanHeight;",

            "varying vec2 vUv;",

            "void main() {",

                //r channel: height
                //g channel: vertDeriv
                //b channel: UNUSED
                //a channel: prev mean height

                //read texture from previous step
                "vec4 t = texture2D(uTexture, vUv);",

                //remove previous mean height first to bring back to 0 height
                "t.r -= t.a;",

                //propagate
                "vec2 du = vec2(uTexelSize.r, 0.0);",
                "vec2 dv = vec2(0.0, uTexelSize.g);",
                "t.g += 0.25 * (texture2D(uTexture,vUv+du).r",
                               "+ texture2D(uTexture,vUv-du).r",
                               "+ texture2D(uTexture,vUv+dv).r",
                               "+ texture2D(uTexture,vUv-dv).r - 4.0 * t.a) - t.r;",
                "t.g *= uDampingFactor;",

                //update
                "t.r += t.g;",

                //add new mean height
                "t.r += uMeanHeight;",

                //store new mean height
                "t.a = uMeanHeight;",

                //write out to texture for next step
                "gl_FragColor = t;",
            "}"

        ].join('\n'),

        hfWater_xWater: [

            //GPU version of X Water

            //NOTE: I have added in mean height in the calculations, purely because of the flooding system.
            //It is not necessary if you do not need to rise the water level.

            "uniform sampler2D uTexture;",
            "uniform vec2 uTexelSize;",
            "uniform float uDampingFactor;",
            "uniform float uMeanHeight;",

            "varying vec2 vUv;",

            "void main() {",

                //r channel: height
                //g channel: field1
                //b channel: field2
                //a channel: prev mean height

                //read texture from previous step
                "vec4 t = texture2D(uTexture, vUv);",

                //remove previous mean height first to bring back to 0 height
                "t.r -= t.a;",

                //propagate
                "vec2 du = vec2(uTexelSize.r, 0.0);",
                "vec2 dv = vec2(0.0, uTexelSize.g);",
                "t.b = 0.5 * (texture2D(uTexture,vUv+du).r",
                               "+ texture2D(uTexture,vUv-du).r",
                               "+ texture2D(uTexture,vUv+dv).r",
                               "+ texture2D(uTexture,vUv-dv).r - 4.0 * t.a) - t.b;",
                "t.b *= uDampingFactor;",

                //update
                "t.r = t.b;",

                //add new mean height
                "t.r += uMeanHeight;",

                //store new mean height
                "t.a = uMeanHeight;",

                //swap buffers
                "float temp = t.g;",
                "t.g = t.b;",
                "t.b = temp;",

                //write out to texture for next step
                "gl_FragColor = t;",
            "}"

        ].join('\n'),

        hfWater_tessendorfIWave_convolve: [

            //GPU version of "Interactive Water Surfaces" (Jerry Tessendorf, Game Programming Gems 4).
            //This is the convolution pre-pass to find the vertical derivative.

            //have to use #define here to get compile-time constant values,
            //otherwise there are problems in the double-for-loop and indexing into array.
            //remember to change this radius value after changing that in the GpuTessendorfIWaveWater class.
            "#define KERNEL_RADIUS 2",
            "#define KERNEL_WIDTH (2 * (KERNEL_RADIUS) + 1)",

            "uniform sampler2D uWaterTexture;",
            "uniform vec2 uTexelSize;",
            "uniform float uKernel[KERNEL_WIDTH * KERNEL_WIDTH];",

            "varying vec2 vUv;",

            "void main() {",

                //read water texture
                //r channel: height
                //g channel: prev height
                //b channel: vertical derivative
                //a channel: prev mean height
                "vec4 tWater = texture2D(uWaterTexture, vUv);",

                //propagate
                "tWater.b = 0.0;",
                "float fk, fl;",
                "vec4 tWaterNeighbour;",
                "for (int k = -KERNEL_RADIUS; k <= KERNEL_RADIUS; k++) {",
                    "fk = float(k);",
                    "for (int l = -KERNEL_RADIUS; l <= KERNEL_RADIUS; l++) {",
                        "fl = float(l);",
                        "tWaterNeighbour = texture2D(uWaterTexture, vec2(vUv.r + fk * uTexelSize.r, vUv.g + fl * uTexelSize.g));",
                        "tWater.b += uKernel[(k + KERNEL_RADIUS) * KERNEL_WIDTH + (l + KERNEL_RADIUS)] * (tWaterNeighbour.r - tWaterNeighbour.a);",
                    "}",
                "}",

                //write out to texture for next step
                "gl_FragColor = tWater;",
            "}"

        ].join('\n'),

        hfWater_tessendorfIWave: [

            //GPU version of "Interactive Water Surfaces" (Jerry Tessendorf, Game Programming Gems 4).
            //Need to run convolve fragment shader first before running this.

            //NOTE: I have added in mean height in the calculations, purely because of the flooding system.
            //It is not necessary if you do not need to rise the water level.

            "uniform sampler2D uWaterTexture;",
            "uniform float uTwoMinusDampTimesDt;",
            "uniform float uOnePlusDampTimesDt;",
            "uniform float uGravityTimesDtTimesDt;",
            "uniform float uMeanHeight;",

            "varying vec2 vUv;",

            "void main() {",

                //read water texture
                //r channel: height
                //g channel: prev height
                //b channel: vertical derivative
                //a channel: prev mean height
                "vec4 tWater = texture2D(uWaterTexture, vUv);",

                //remove previous mean height first to bring back to 0 height
                "tWater.r -= tWater.a;",

                //propagate
                "float temp = tWater.r;",
                "tWater.r = (tWater.r * uTwoMinusDampTimesDt",
                           "- tWater.g",
                           "- tWater.b * uGravityTimesDtTimesDt) / uOnePlusDampTimesDt;",
                "tWater.g = temp;",

                //add new mean height
                "tWater.r += uMeanHeight;",

                //store new mean height
                "tWater.a = uMeanHeight;",

                //write out to texture for next step
                "gl_FragColor = tWater;",
            "}"

        ].join('\n'),

        hfWater_pipeModel_calcFlux: [

            //GPU version of pipe model water.
            //This is the pre-pass to calculate flux.

            "uniform sampler2D uTerrainTexture;",
            "uniform sampler2D uWaterTexture;",
            "uniform sampler2D uFluxTexture;",
            "uniform sampler2D uStaticObstaclesTexture;",
            "uniform sampler2D uBoundaryTexture;",
            "uniform vec2 uTexelSize;",
            "uniform float uDampingFactor;",
            "uniform float uHeightToFluxFactor;",
            "uniform float uSegmentSizeSquared;",
            "uniform float uDt;",
            "uniform float uMinWaterHeight;",

            "varying vec2 vUv;",

            "void main() {",

                "vec2 du = vec2(uTexelSize.r, 0.0);",
                "vec2 dv = vec2(0.0, uTexelSize.g);",

                //read terrain texture
                //r channel: terrain height
                "vec4 tTerrain = texture2D(uTerrainTexture, vUv);",

                //read water texture
                //r channel: water height
                //g, b channels: vel
                //a channel: UNUSED
                "vec4 tWater = texture2D(uWaterTexture, vUv);",

                //read static obstacle texture
                //r channel: height
                "vec4 tObstacle = texture2D(uStaticObstaclesTexture, vUv);",

                "float waterHeight = tWater.r;",
                "float totalHeight = max(tTerrain.r, tObstacle.r) + waterHeight;",

                //read flux texture
                //r channel: fluxR
                //g channel: fluxL
                //b channel: fluxB
                //a channel: fluxT
                "vec4 tFlux = texture2D(uFluxTexture, vUv);",

                //calculate new flux
                "tFlux *= uDampingFactor;",
                "vec4 neighbourTotalHeights = vec4(texture2D(uWaterTexture, vUv + du).r + max(texture2D(uTerrainTexture, vUv + du).r, texture2D(uStaticObstaclesTexture, vUv + du).r),",
                                                  "texture2D(uWaterTexture, vUv - du).r + max(texture2D(uTerrainTexture, vUv - du).r, texture2D(uStaticObstaclesTexture, vUv - du).r),",
                                                  "texture2D(uWaterTexture, vUv - dv).r + max(texture2D(uTerrainTexture, vUv - dv).r, texture2D(uStaticObstaclesTexture, vUv - dv).r),",
                                                  "texture2D(uWaterTexture, vUv + dv).r + max(texture2D(uTerrainTexture, vUv + dv).r, texture2D(uStaticObstaclesTexture, vUv + dv).r));",
                "tFlux += (totalHeight - neighbourTotalHeights) * uHeightToFluxFactor;",
                "tFlux = max(vec4(0.0), tFlux);",

                //read boundary texture
                //r channel: fluxR
                //g channel: fluxL
                //b channel: fluxB
                //a channel: fluxT
                "vec4 tBoundary = texture2D(uBoundaryTexture, vUv);",

                //multiply flux with boundary texture to mask out fluxes
                "tFlux *= tBoundary;",

                //scale down outflow if it is more than available volume in the column
                "float currVol = (waterHeight - uMinWaterHeight) * uSegmentSizeSquared;",
                "float outVol = uDt * (tFlux.r + tFlux.g + tFlux.b + tFlux.a);",
                "tFlux *= min(1.0, currVol / outVol);",

                //write out to texture for next step
                "gl_FragColor = tFlux;",
            "}"

        ].join('\n'),

        hfWater_pipeModel: [

            //GPU version of pipe model water.
            //Need to run the flux calculation pre-pass first before running this.

            "uniform sampler2D uWaterTexture;",
            "uniform sampler2D uFluxTexture;",
            "uniform vec2 uTexelSize;",
            "uniform float uSegmentSize;",
            "uniform float uDt;",
            "uniform float uMinWaterHeight;",

            "varying vec2 vUv;",

            "void main() {",

                "vec2 du = vec2(uTexelSize.r, 0.0);",
                "vec2 dv = vec2(0.0, uTexelSize.g);",

                //read water texture
                //r channel: water height
                //g channel: horizontal velocity x
                //b channel: horizontal velocity z
                //a channel: UNUSED
                "vec4 tWater = texture2D(uWaterTexture, vUv);",

                //read flux textures
                //r channel: fluxR
                //g channel: fluxL
                //b channel: fluxB
                //a channel: fluxT
                "vec4 tFlux = texture2D(uFluxTexture, vUv);",
                "vec4 tFluxPixelLeft = texture2D(uFluxTexture, vUv-du);",
                "vec4 tFluxPixelRight = texture2D(uFluxTexture, vUv+du);",
                "vec4 tFluxPixelTop = texture2D(uFluxTexture, vUv+dv);",
                "vec4 tFluxPixelBottom = texture2D(uFluxTexture, vUv-dv);",

                "float avgWaterHeight = tWater.r;",

                //calculate new height
                "float fluxOut = tFlux.r + tFlux.g + tFlux.b + tFlux.a;",
                "float fluxIn = tFluxPixelLeft.r + tFluxPixelRight.g + tFluxPixelTop.b + tFluxPixelBottom.a;",
                "tWater.r += (fluxIn - fluxOut) * uDt / (uSegmentSize * uSegmentSize);",
                "tWater.r = max(uMinWaterHeight, tWater.r);",

                "avgWaterHeight = 0.5 * (avgWaterHeight + tWater.r);",  //this will get the average height of that from before and after the change

                //calculate horizontal velocities, from amount of water passing through per unit time
                "if (avgWaterHeight == 0.0) {",  //prevent division by 0
                    "tWater.g = 0.0;",
                    "tWater.b = 0.0;",
                "} else {",
                    "float threshold = float(tWater.r > 0.2);",  //0/1 threshold value for masking out weird velocities at terrain edges
                    "float segmentSizeTimesAvgWaterHeight = uSegmentSize * avgWaterHeight;",
                    "tWater.g = threshold * 0.5 * (tFluxPixelLeft.r - tFlux.g + tFlux.r - tFluxPixelRight.g) / segmentSizeTimesAvgWaterHeight;",
                    "tWater.b = threshold * 0.5 * (tFluxPixelTop.b - tFlux.a + tFlux.b - tFluxPixelBottom.a) / segmentSizeTimesAvgWaterHeight;",
                "}",

                //write out to texture for next step
                "gl_FragColor = tWater;",
            "}"

        ].join('\n'),

        setColor: [

            //Fragment shader to set colors on a render target

            "uniform vec4 uColor;",

            "void main() {",
                "gl_FragColor = uColor;",
            "}"

        ].join('\n'),

        setColorMasked: [

            //Fragment shader to set colors on specific channels while keeping the rest of the channels intact

            "uniform sampler2D uTexture;",
            "uniform vec4 uColor;",
            "uniform vec4 uChannelMask;",

            "varying vec2 vUv;",

            "void main() {",
                "vec4 t = texture2D(uTexture, vUv);",
                "gl_FragColor = (vec4(1.0) - uChannelMask) * t + uChannelMask * uColor;",
            "}"

        ].join('\n'),

        setSolidAlpha: [

            //Fragment shader that sets alpha for the given texture to 1.0

            "uniform sampler2D uTexture;",

            "varying vec2 vUv;",

            "void main() {",
                "gl_FragColor = vec4(texture2D(uTexture, vUv).rgb, 1.0);",
            "}"

        ].join('\n'),

        hfWater_obstacles_static: [

            //Fragment shader to calculate static obstacles texture

            "uniform sampler2D uObstacleTopTexture;",
            "uniform float uHalfRange;",

            "varying vec2 vUv;",

            "void main() {",

                //read texture for obstacle
                //r, g, b channels: depth (all these channels contain same value)
                //a channel: alpha
                "vec4 tTop = texture2D(uObstacleTopTexture, vUv);",

                //convert top value to world height
                "float topHeight = (uHalfRange - tTop.r) * tTop.a;",

                //write out to texture for next step
                "gl_FragColor = vec4(topHeight, 0.0, 0.0, 1.0);",
            "}"

        ].join('\n'),

        hfWater_obstacles_dynamic: [

            //Fragment shader to accumulate an obstacle texture

            "uniform sampler2D uObstaclesTexture;",
            "uniform sampler2D uObstacleTopTexture;",
            "uniform sampler2D uObstacleBottomTexture;",
            "uniform sampler2D uWaterTexture;",
            "uniform sampler2D uTerrainTexture;",

            "uniform float uHalfRange;",

            "varying vec2 vUv;",

            "void main() {",

                //read texture from previous step
                //r channel: whether in obstacle or not (accumulated)
                //g channel: height of water displaced (accumulated)
                //b channel: height of water displaced from previous step (accumulated)
                //a channel: height of water displaced (only for current rendered object)
                "vec4 t = texture2D(uObstaclesTexture, vUv);",

                //read texture for obstacle
                //r, g, b channels: depth (all these channels contain same value)
                //a channel: alpha
                "vec4 tTop = texture2D(uObstacleTopTexture, vUv);",
                "vec4 tBottom = texture2D(uObstacleBottomTexture, vec2(vUv.x, 1.0-vUv.y));",

                //read texture for water and terrain
                //r channel: height
                //other channels: other data which are not used here
                "vec4 tWater = texture2D(uWaterTexture, vUv);",
                "vec4 tTerrain = texture2D(uTerrainTexture, vUv);",
                "float waterHeight = tWater.r + tTerrain.r;",

                //convert top and bottom into same space (water plane at height of 0, upwards positive)
                "float bottomHeight = (tBottom.r - uHalfRange - waterHeight) * tBottom.a;",
                "float topHeight = (uHalfRange - waterHeight - tTop.r) * tTop.a;",

                //compare the top and bottom depths to determine if water is in obstacle
                "bool inObstacle = bottomHeight < 0.0 && topHeight > 0.0;",

                //also calculate amount of water displaced
                "float displacedHeight;",
                "if (bottomHeight > 0.0) {",
                    //totally above water, so there is no water displaced
                    "displacedHeight = 0.0;",
                "} else if (topHeight < 0.0) {",
                    //totally below water, so water displaced height is top minus bottom
                    "displacedHeight = topHeight - bottomHeight;",
                "} else {",
                    //partially submerged, so water displaced is water level minus bottom (which is just negative of bottom)
                    "displacedHeight = -bottomHeight;",
                "}",

                //write out to texture for next step
                "gl_FragColor = vec4(max(t.r, float(inObstacle)), t.g + displacedHeight, t.b, displacedHeight);",
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
                    "return vec4(0.0, 0.0, 0.0, 0.0);",
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

        copyChannels: [

            //Fragment shader that copies data from one channel to another

            "uniform sampler2D uTexture;",
            "uniform vec4 uOriginChannelId;",
            "uniform vec4 uDestChannelId;",

            "varying vec2 vUv;",

            "void main() {",

                //read texture
                "vec4 t = texture2D(uTexture, vUv);",

                //get data from origin channel
                "float data = dot(t, uOriginChannelId);",

                //write to destination channel
                "gl_FragColor = (vec4(1.0) - uDestChannelId) * t + uDestChannelId * data;",
            "}"

        ].join('\n'),

        hfWater_calcDisturbMap: [

            //Fragment shader to calculate a water disturb map based on displaced heights from this frame and prev frame

            "uniform sampler2D uTexture;",
            "uniform vec2 uTexelSize;",

            "varying vec2 vUv;",

            "void main() {",

                "vec2 du = vec2(uTexelSize.r, 0.0);",
                "vec2 dv = vec2(0.0, uTexelSize.g);",

                //read textures
                //r channel: whether in obstacle or not (accumulated)
                //g channel: height of water displaced (accumulated)
                //b channel: height of water displaced from previous step (accumulated)
                //a channel: height of water displaced (only for current rendered object)
                "vec4 tLeft = texture2D(uTexture, vUv-du);",
                "vec4 tRight = texture2D(uTexture, vUv+du);",
                "vec4 tTop = texture2D(uTexture, vUv+dv);",
                "vec4 tBottom = texture2D(uTexture, vUv-dv);",

                //receive a quarter of displaced volume differences from neighbours
                "float result = 0.25 * ( (tLeft.g-tLeft.b) + (tRight.g-tRight.b) + (tTop.g-tTop.b) + (tBottom.g-tBottom.b) );",

                "gl_FragColor = vec4(result, -result, 0.0, 1.0);",  //g channel is there just to visualize negative displaced volumes
            "}"

        ].join('\n'),

        gaussianBlurX: [

            //Fragment shader gaussian blur (horizontal pass)
            //Largely obtained from:
            //http://www.gamerendering.com/2008/10/11/gaussian-blur-filter-shader/

            "uniform sampler2D uTexture;",
            "uniform float uTexelSize;",

            "varying vec2 vUv;",

            "void main() {",

                "vec4 sum = vec4(0.0);",

                // blur in x (horizontal)
                // take nine samples, with the distance uTexelSize between them
                "sum += texture2D(uTexture, vec2(vUv.x - 4.0 * uTexelSize, vUv.y)) * 0.05;",
                "sum += texture2D(uTexture, vec2(vUv.x - 3.0 * uTexelSize, vUv.y)) * 0.09;",
                "sum += texture2D(uTexture, vec2(vUv.x - 2.0 * uTexelSize, vUv.y)) * 0.12;",
                "sum += texture2D(uTexture, vec2(vUv.x - uTexelSize, vUv.y)) * 0.15;",
                "sum += texture2D(uTexture, vec2(vUv.x, vUv.y)) * 0.16;",
                "sum += texture2D(uTexture, vec2(vUv.x + uTexelSize, vUv.y)) * 0.15;",
                "sum += texture2D(uTexture, vec2(vUv.x + 2.0 * uTexelSize, vUv.y)) * 0.12;",
                "sum += texture2D(uTexture, vec2(vUv.x + 3.0 * uTexelSize, vUv.y)) * 0.09;",
                "sum += texture2D(uTexture, vec2(vUv.x + 4.0 * uTexelSize, vUv.y)) * 0.05;",

                "gl_FragColor = sum;",
            "}"

        ].join('\n'),

        gaussianBlurY: [

            //Fragment shader gaussian blur (vertical pass)
            //Largely obtained from:
            //http://www.gamerendering.com/2008/10/11/gaussian-blur-filter-shader/

            "uniform sampler2D uTexture;",
            "uniform float uTexelSize;",

            "varying vec2 vUv;",

            "void main() {",

                "vec4 sum = vec4(0.0);",

                // blur in y (vertical)
                // take nine samples, with the distance uTexelSize between them
                "sum += texture2D(uTexture, vec2(vUv.x, vUv.y - 4.0 * uTexelSize)) * 0.05;",
                "sum += texture2D(uTexture, vec2(vUv.x, vUv.y - 3.0 * uTexelSize)) * 0.09;",
                "sum += texture2D(uTexture, vec2(vUv.x, vUv.y - 2.0 * uTexelSize)) * 0.12;",
                "sum += texture2D(uTexture, vec2(vUv.x, vUv.y - uTexelSize)) * 0.15;",
                "sum += texture2D(uTexture, vec2(vUv.x, vUv.y)) * 0.16;",
                "sum += texture2D(uTexture, vec2(vUv.x, vUv.y + uTexelSize)) * 0.15;",
                "sum += texture2D(uTexture, vec2(vUv.x, vUv.y + 2.0 * uTexelSize)) * 0.12;",
                "sum += texture2D(uTexture, vec2(vUv.x, vUv.y + 3.0 * uTexelSize)) * 0.09;",
                "sum += texture2D(uTexture, vec2(vUv.x, vUv.y + 4.0 * uTexelSize)) * 0.05;",

                "gl_FragColor = sum;",
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

        combineTexturesMask: [

            //Fragment shader to combine textures: multiply texture1 with alpha channel of texture2

            "uniform sampler2D uTexture1;",
            "uniform sampler2D uTexture2;",  //for alpha channel

            "varying vec2 vUv;",

            "void main() {",

                //read textures
                "vec4 t1 = texture2D(uTexture1, vUv);",
                "vec4 t2 = texture2D(uTexture2, vUv);",

                //multiply all channels of t1 with alpha of t2
                "t1 *= t2.a;",

                "gl_FragColor = t1;",
            "}"

        ].join('\n'),

        erode: [

            //Fragment shader erode. This is just a simple 1-pixel erosion based on min.

            "uniform sampler2D uTexture;",
            "uniform float uTexelSize;",

            "varying vec2 vUv;",

            "void main() {",

                "vec2 du = vec2(uTexelSize, 0.0);",
                "vec2 dv = vec2(0.0, uTexelSize);",

                //get current and neighbour pixel values
                "float curr = texture2D(uTexture, vUv).r;",
                "float right = texture2D(uTexture, vUv + du).r;",
                "float left = texture2D(uTexture, vUv - du).r;",
                "float bottom = texture2D(uTexture, vUv - dv).r;",
                "float top = texture2D(uTexture, vUv + dv).r;",

                //take min
                "float result = min(curr, min(right, min(left, min(bottom, top))));",

                "gl_FragColor = vec4(result, 0.0, 0.0, 1.0);",
            "}"

        ].join('\n'),

        depth: [

            //Fragment shader to set RGB colors based on depth.
            //The one that comes with Three.js is clamped to 1 and is non-linear, so I have to create my own version.

            "uniform float uNear;",
            "uniform float uFar;",

            "void main() {",
                "float color = mix(uFar, uNear, gl_FragCoord.z/gl_FragCoord.w);",
                "gl_FragColor = vec4(vec3(color), 1.0);",
            "}"

        ].join('\n'),

        hfWater_pipeModel_calcFinalWaterHeight: [

            //Fragment shader to combine textures

            "uniform sampler2D uTerrainTexture;",
            "uniform sampler2D uStaticObstaclesTexture;",
            "uniform sampler2D uWaterTexture;",
            "uniform sampler2D uMultiplyTexture;",  //texture to multiply the results of uTerrainTexture + uStaticObstaclesTexture
            "uniform float uMaskOffset;",  //using uMultiplyTexture as a mask to offset the 0 regions

            "varying vec2 vUv;",

            "void main() {",

                "vec4 t = max(texture2D(uTerrainTexture, vUv), texture2D(uStaticObstaclesTexture, vUv)) + texture2D(uWaterTexture, vUv);",

                //read multiply texture and multiply
                "vec4 tMultiply = texture2D(uMultiplyTexture, vUv);",
                "t *= tMultiply;",

                //do offset with masking
                "t += (1.0 - tMultiply) * uMaskOffset;",

                "gl_FragColor = t;",
            "}"

        ].join('\n')

    }

};
SKUNAMI.GpuHeightFieldWater.prototype.__setupShaders = function () {

    this.__disturbAndSourceMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: this.__emptyTexture },
            uStaticObstaclesTexture: { type: 't', value: this.__emptyTexture },
            uDisturbTexture: { type: 't', value: this.__emptyTexture },
            uUseObstacleTexture: { type: 'i', value: 1 },  //turn on by default for most of the surface water types to use (pipe model will not need this)
            uIsDisturbing: { type: 'i', value: 0 },
            uDisturbPos: { type: 'v2', value: new THREE.Vector2(0.5, 0.5) },
            uDisturbAmount: { type: 'f', value: this.__disturbAmount },
            uDisturbRadius: { type: 'f', value: this.__disturbRadius },
            uIsSourcing: { type: 'i', value: 0 },
            uSourcePos: { type: 'v2', value: new THREE.Vector2(0.5, 0.5) },
            uSourceAmount: { type: 'f', value: this.__sourceAmount },
            uSourceRadius: { type: 'f', value: this.__sourceRadius },
            uIsFlooding: { type: 'i', value: 0 },  //for pipe model water only
            uFloodAmount: { type: 'f', value: 0 }  //for pipe model water only
        },
        vertexShader: this.__shaders.vert['passUv'],
        fragmentShader: this.__shaders.frag['hfWater_disturb']
    });

    this.__waterSimMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: this.__emptyTexture },
            uTexelSize: { type: 'v2', value: new THREE.Vector2(this.__texelSize, this.__texelSize) },
            uTexelWorldSize: { type: 'v2', value: new THREE.Vector2(this.__size / this.__res, this.__size / this.__res) },
            uDampingFactor: { type: 'f', value: this.__dampingFactor },
            uDt: { type: 'f', value: 0.0 },
            uMeanHeight: { type: 'f', value: this.__meanHeight }
        },
        vertexShader: this.__shaders.vert['passUv'],
        fragmentShader: this.__getWaterFragmentShaderContent()
    });

    this.__resetMaskedMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: this.__emptyTexture },
            uColor: { type: 'v4', value: new THREE.Vector4() },
            uChannelMask: { type: 'v4', value: new THREE.Vector4() }
        },
        vertexShader: this.__shaders.vert['passUv'],
        fragmentShader: this.__shaders.frag['setColorMasked']
    });

    this.__setSolidAlphaMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: this.__emptyTexture }
        },
        vertexShader: this.__shaders.vert['passUv'],
        fragmentShader: this.__shaders.frag['setSolidAlpha']
    });

    this.__staticObstaclesMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uObstacleTopTexture: { type: 't', value: this.__emptyTexture },
            uHalfRange: { type: 'f', value: this.__rttObstaclesCameraRange / 2.0 }
        },
        vertexShader: this.__shaders.vert['passUv'],
        fragmentShader: this.__shaders.frag['hfWater_obstacles_static']
    });

    this.__dynObstaclesMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uObstaclesTexture: { type: 't', value: this.__emptyTexture },
            uObstacleTopTexture: { type: 't', value: this.__emptyTexture },
            uObstacleBottomTexture: { type: 't', value: this.__emptyTexture },
            uWaterTexture: { type: 't', value: this.__emptyTexture },
            uTerrainTexture: { type: 't', value: this.__emptyTexture },
            uHalfRange: { type: 'f', value: this.__rttObstaclesCameraRange / 2.0 }
        },
        vertexShader: this.__shaders.vert['passUv'],
        fragmentShader: this.__shaders.frag['hfWater_obstacles_dynamic']
    });

    this.__rttEncodeFloatMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: this.__emptyTexture },
            uChannelMask: { type: 'v4', value: new THREE.Vector4() }
        },
        vertexShader: this.__shaders.vert['passUv'],
        fragmentShader: this.__shaders.frag['encodeFloat']
    });

    this.__copyChannelsMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: this.__emptyTexture },
            uOriginChannelId: { type: 'v4', value: new THREE.Vector4() },
            uDestChannelId: { type: 'v4', value: new THREE.Vector4() }
        },
        vertexShader: this.__shaders.vert['passUv'],
        fragmentShader: this.__shaders.frag['copyChannels']
    });

    this.__calcDisturbMapMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: this.__emptyTexture },
            uTexelSize: { type: 'v2', value: new THREE.Vector2(this.__texelSize, this.__texelSize) }
        },
        vertexShader: this.__shaders.vert['passUv'],
        fragmentShader: this.__shaders.frag['hfWater_calcDisturbMap']
    });

    this.__gaussianBlurXMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: this.__emptyTexture },
            uTexelSize: { type: 'f', value: this.__texelSize }
        },
        vertexShader: this.__shaders.vert['passUv'],
        fragmentShader: this.__shaders.frag['gaussianBlurX']
    });

    this.__gaussianBlurYMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: this.__emptyTexture },
            uTexelSize: { type: 'f', value: this.__texelSize }
        },
        vertexShader: this.__shaders.vert['passUv'],
        fragmentShader: this.__shaders.frag['gaussianBlurY']
    });

    this.__combineTexturesMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture1: { type: 't', value: this.__emptyTexture },
            uTexture2: { type: 't', value: this.__emptyTexture }
        },
        vertexShader: this.__shaders.vert['passUv'],
        fragmentShader: this.__shaders.frag['combineTextures']
    });

    this.__erodeMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture: { type: 't', value: this.__emptyTexture },
            uTexelSize: { type: 'f', value: this.__texelSize }
        },
        vertexShader: this.__shaders.vert['passUv'],
        fragmentShader: this.__shaders.frag['erode']
    });

    this.__channelVectors = {
        'r': new THREE.Vector4(1.0, 0.0, 0.0, 0.0),
        'g': new THREE.Vector4(0.0, 1.0, 0.0, 0.0),
        'b': new THREE.Vector4(0.0, 0.0, 1.0, 0.0),
        'a': new THREE.Vector4(0.0, 0.0, 0.0, 1.0)
    };
};
//Sets up the render-to-texture scene (2 render targets by default)
SKUNAMI.GpuHeightFieldWater.prototype.__setupRttScene = function () {

    //create a RTT scene
    this.__rttScene = new THREE.Scene();

    //create an orthographic RTT camera
    var far = 10000;
    var near = -far;
    this.__rttCamera = new THREE.OrthographicCamera(-this.__halfSize, this.__halfSize, this.__halfSize, -this.__halfSize, near, far);

    //create a quad which we will use to invoke the shaders
    this.__rttQuadGeom = new THREE.PlaneGeometry(this.__size, this.__size);
    this.__rttQuadMesh = new THREE.Mesh(this.__rttQuadGeom, this.__waterSimMaterial);
    this.__rttScene.add(this.__rttQuadMesh);
};
SKUNAMI.GpuHeightFieldWater.prototype.__setupRttRenderTargets = function () {
    //create RTT render targets (need two for feedback)
    if (this.__supportsTextureFloatLinear) {
        this.__rttRenderTarget1 = new THREE.WebGLRenderTarget(this.__res, this.__res, this.__linearFloatRgbaParams);
    } else {
        this.__rttRenderTarget1 = new THREE.WebGLRenderTarget(this.__res, this.__res, this.__nearestFloatRgbaParams);
    }
    this.__rttRenderTarget1.generateMipmaps = false;
    this.__clearRenderTarget(this.__rttRenderTarget1, 0.0, 0.0, 0.0, 0.0);  //clear render target (necessary for FireFox)
    this.__rttRenderTarget2 = this.__rttRenderTarget1.clone();
    this.__clearRenderTarget(this.__rttRenderTarget2, 0.0, 0.0, 0.0, 0.0);  //clear render target (necessary for FireFox)

    //create render targets purely for display purposes
    this.__rttWaterDisplay = this.__rttRenderTarget1.clone();
    this.__clearRenderTarget(this.__rttWaterDisplay, 0.0, 0.0, 0.0, 1.0);  //clear render target (necessary for FireFox)
    this.__rttObstaclesDisplay = this.__rttRenderTarget1.clone();
    this.__clearRenderTarget(this.__rttObstaclesDisplay, 0.0, 0.0, 0.0, 1.0);  //clear render target (necessary for FireFox)

    //create another RTT render target encoding float to 4-byte data
    this.__rttFloatEncoderRenderTarget = new THREE.WebGLRenderTarget(this.__res, this.__res, this.__nearestFloatRgbaParams);
    this.__rttFloatEncoderRenderTarget.generateMipmaps = false;
    this.__clearRenderTarget(this.__rttFloatEncoderRenderTarget, 0.0, 0.0, 0.0, 0.0);  //clear render target (necessary for FireFox)

    //some render targets for blurred textures
    this.__rttCombinedHeightsBlurredRenderTarget = this.__rttRenderTarget1.clone();
    this.__clearRenderTarget(this.__rttCombinedHeightsBlurredRenderTarget, 0.0, 0.0, 0.0, 0.0);  //clear render target (necessary for FireFox)
    this.__rttDynObstaclesBlurredRenderTarget = this.__rttRenderTarget1.clone();
    this.__clearRenderTarget(this.__rttDynObstaclesBlurredRenderTarget, 0.0, 0.0, 0.0, 0.0);  //clear render target (necessary for FireFox)

    //create render target for storing the disturbed map (due to interaction with rigid bodes)
    this.__rttDisturbMapRenderTarget = this.__rttRenderTarget1.clone();
    this.__clearRenderTarget(this.__rttDisturbMapRenderTarget, 0.0, 0.0, 0.0, 0.0);  //clear render target (necessary for FireFox)
};
SKUNAMI.GpuHeightFieldWater.prototype.__clearRenderTarget = function (renderTarget, r, g, b, a) {
    this.__rttQuadMesh.material = this.__resetMaterial;
    this.__resetMaterial.uniforms['uColor'].value.set(r, g, b, a);
    this.__renderer.render(this.__rttScene, this.__rttCamera, renderTarget, false);
};
//Sets up the vertex-texture-fetch for the given mesh
SKUNAMI.GpuHeightFieldWater.prototype.__setupVtf = function () {
    this.__mesh.material = new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([
            THREE.UniformsLib['lights'],
            THREE.UniformsLib['shadowmap'],
            {
                uTexture: { type: 't', value: this.__rttRenderTarget1 },
                uTexelSize: { type: 'v2', value: new THREE.Vector2(this.__texelSize, this.__texelSize) },
                uTexelWorldSize: { type: 'v2', value: new THREE.Vector2(this.__segmentSize, this.__segmentSize) },
                uHeightMultiplier: { type: 'f', value: 1.0 },
                uBaseColor: { type: 'v3', value: new THREE.Vector3(0.45, 0.95, 1.0) }
            }
        ]),
        vertexShader: this.__shaders.vert['heightMap'],
        fragmentShader: this.__shaders.frag['lambert'],
        lights: true
    });
};
//Checks for WebGL extensions. Checks for OES_texture_float_linear and vertex texture fetch capability by default.
SKUNAMI.GpuHeightFieldWater.prototype.__checkExtensions = function (renderer) {
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
SKUNAMI.GpuHeightFieldWater.prototype.__initDataAndTextures = function () {

    var i, j, len, idx;

    //init everything to 1 first
    for (i = 0, len = this.__boundaryData.length; i < len; i++) {
        this.__boundaryData[i] = 1.0;
    }

    //init all boundary values to 0
    j = 0;
    for (i = 0; i < this.__res; i++) {
        idx = 4 * (i + this.__res * j);
        this.__boundaryData[idx] = 0.0;
        this.__boundaryData[idx + 1] = 0.0;
        this.__boundaryData[idx + 2] = 0.0;
        this.__boundaryData[idx + 3] = 0.0;
    }
    j = this.__res - 1;
    for (i = 0; i < this.__res; i++) {
        idx = 4 * (i + this.__res * j);
        this.__boundaryData[idx] = 0.0;
        this.__boundaryData[idx + 1] = 0.0;
        this.__boundaryData[idx + 2] = 0.0;
        this.__boundaryData[idx + 3] = 0.0;
    }
    i = 0;
    for (j = 0; j < this.__res; j++) {
        idx = 4 * (i + this.__res * j);
        this.__boundaryData[idx] = 0.0;
        this.__boundaryData[idx + 1] = 0.0;
        this.__boundaryData[idx + 2] = 0.0;
        this.__boundaryData[idx + 3] = 0.0;
    }
    i = this.__res - 1;
    for (j = 0; j < this.__res; j++) {
        idx = 4 * (i + this.__res * j);
        this.__boundaryData[idx] = 0.0;
        this.__boundaryData[idx + 1] = 0.0;
        this.__boundaryData[idx + 2] = 0.0;
        this.__boundaryData[idx + 3] = 0.0;
    }

    //finally assign data to texture
    this.__boundaryTexture.image.data = this.__boundaryData;
    this.__boundaryTexture.needsUpdate = true;
};
SKUNAMI.GpuHeightFieldWater.prototype.__setupObstaclesScene = function () {

    //create top and bottom cameras
    this.__rttObstaclesTopCamera = new THREE.OrthographicCamera(-this.__halfSize, this.__halfSize, -this.__halfSize, this.__halfSize, 0, this.__rttObstaclesCameraRange);
    this.__rttObstaclesTopCamera.position.y = -this.__rttObstaclesCameraRange / 2;
    this.__rttObstaclesTopCamera.rotation.x = THREE.Math.degToRad(90);
    this.__rttObstaclesBottomCamera = new THREE.OrthographicCamera(-this.__halfSize, this.__halfSize, -this.__halfSize, this.__halfSize, 0, this.__rttObstaclesCameraRange);
    this.__rttObstaclesBottomCamera.position.y = this.__rttObstaclesCameraRange / 2;
    this.__rttObstaclesBottomCamera.rotation.x = THREE.Math.degToRad(-90);

    //create obstacles render targets and two more for top and bottom views
    this.__rttStaticObstaclesRenderTarget = this.__rttRenderTarget1.clone();
    this.__rttDynObstaclesRenderTarget = this.__rttRenderTarget1.clone();
    this.__rttObstacleTopRenderTarget = this.__rttRenderTarget1.clone();
    this.__rttObstacleBottomRenderTarget = this.__rttRenderTarget1.clone();

    //create render target for masking out water areas based on obstacle's alpha
    this.__rttMaskedWaterRenderTarget = this.__rttRenderTarget1.clone();

    //create material for rendering the obstacles
    this.__rttObstaclesDepthMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uNear: { type: 'f', value: 0 },
            uFar: { type: 'f', value: this.__rttObstaclesCameraRange }
        },
        vertexShader: this.__shaders.vert['pass'],
        fragmentShader: this.__shaders.frag['depth']
    });

    //create material for masking out water texture
    this.__maskWaterMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTexture1: { type: 't', value: this.__emptyTexture },
            uTexture2: { type: 't', value: this.__emptyTexture }
        },
        vertexShader: this.__shaders.vert['passUv'],
        fragmentShader: this.__shaders.frag['combineTexturesMask']
    });
};
/**
 * Resets the simulation
 */
SKUNAMI.GpuHeightFieldWater.prototype.reset = function () {
    this.__initCounter = 5;
};
SKUNAMI.GpuHeightFieldWater.prototype.__resetPass = function () {
    //reset height in main render target
    this.__clearRenderTarget(this.__rttRenderTarget2, this.__meanHeight, 0, 0, this.__meanHeight);
    this.__swapRenderTargets();
};
/**
 * Disturbs the water, causing ripples on the water surface
 * @param  {THREE.Vector3} position World-space position to disturb at
 * @param  {number} amount Amount of water to disturb
 * @param  {number} radius Radius of disturb
 */
SKUNAMI.GpuHeightFieldWater.prototype.disturb = function (position, amount, radius) {
    this.__isDisturbing = true;
    this.__disturbUvPos.x = (position.x + this.__halfSize) / this.__size;
    this.__disturbUvPos.y = (position.z + this.__halfSize) / this.__size;
    this.__disturbAmount = amount;
    this.__disturbRadius = radius;
};
/**
 * Floods the scene by the given volume
 * @abstract
 * @param  {number} volume Volume of water to flood the scene with, in cubic scene units
 */
SKUNAMI.GpuHeightFieldWater.prototype.flood = function (volume) {
    throw new Error('Abstract method not implemented');
};
SKUNAMI.GpuHeightFieldWater.prototype.__disturbPass = function () {
    var shouldRender = false;
    if (this.__disturbMapHasUpdated) {
        // this.__disturbAndSourceMaterial.uniforms['uStaticObstaclesTexture'].value = this.__rttDynObstaclesRenderTarget;
        this.__disturbAndSourceMaterial.uniforms['uDisturbTexture'].value = this.__rttDisturbMapRenderTarget;
        shouldRender = true;
    }
    if (this.__isDisturbing && this.__disturbAmount !== 0.0) {
        // this.__disturbAndSourceMaterial.uniforms['uStaticObstaclesTexture'].value = this.__rttStaticObstaclesRenderTarget;
        this.__disturbAndSourceMaterial.uniforms['uIsDisturbing'].value = this.__isDisturbing;
        this.__disturbAndSourceMaterial.uniforms['uDisturbPos'].value.copy(this.__disturbUvPos);
        this.__disturbAndSourceMaterial.uniforms['uDisturbAmount'].value = this.__disturbAmount;
        this.__disturbAndSourceMaterial.uniforms['uDisturbRadius'].value = this.__disturbRadius / this.__size;
        shouldRender = true;
    }
    if (shouldRender) {
        this.__rttQuadMesh.material = this.__disturbAndSourceMaterial;
        this.__disturbAndSourceMaterial.uniforms['uTexture'].value = this.__rttRenderTarget2;
        this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttRenderTarget1, false);
        this.__swapRenderTargets();

        this.__isDisturbing = false;
        this.__rttQuadMesh.material.uniforms['uIsDisturbing'].value = false;
    }
};
SKUNAMI.GpuHeightFieldWater.prototype.__waterSimPass = function (substepDt) {
    this.__rttQuadMesh.material = this.__waterSimMaterial;
    this.__waterSimMaterial.uniforms['uTexture'].value = this.__rttRenderTarget2;
    this.__waterSimMaterial.uniforms['uDt'].value = substepDt;
    this.__waterSimMaterial.uniforms['uMeanHeight'].value = this.__meanHeight;
    this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttRenderTarget1, false);
    this.__swapRenderTargets();
};
SKUNAMI.GpuHeightFieldWater.prototype.__displayPass = function () {
    if (this.__shouldDisplayWaterTexture) {
        this.__rttQuadMesh.material = this.__setSolidAlphaMaterial;
        this.__setSolidAlphaMaterial.uniforms['uTexture'].value = this.__rttRenderTarget2;
        this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttWaterDisplay, false);
        this.__swapRenderTargets();
    }
    if (this.__shouldDisplayObstaclesTexture) {
        this.__rttQuadMesh.material = this.__setSolidAlphaMaterial;
        this.__setSolidAlphaMaterial.uniforms['uTexture'].value = this.__rttDynObstaclesBlurredRenderTarget;
        this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttObstaclesDisplay, false);
        this.__swapRenderTargets();
    }
};
SKUNAMI.GpuHeightFieldWater.prototype.__calculateSubsteps = function (dt) {
    return 1;
};
/**
 * Updates the water simulation<br/><strong>NOTE:  This needs to be called every frame, after renderer.clear() and before renderer.render(...)</strong>
 * @param  {number} dt Elapsed time since previous frame
 */
SKUNAMI.GpuHeightFieldWater.prototype.update = function (dt) {

    //NOTE: unable to figure out why cannot clear until a few updates later,
    //so using this dirty hack to init for a few frames
    if (this.__initCounter > 0) {
        this.__resetPass();
        this.__initCounter -= 1;
        return;
    }

    //fix dt for the moment (better to be in slow-mo in extreme cases than to explode)
    dt = 1.0 / 60.0;

    //update static obstacle texture
    if (this.__shouldUpdateStaticObstacle) {
        this.__updateStaticObstacleTexture(dt);
        this.__shouldUpdateStaticObstacle = false;
    }

    //update dynamic obstacle textures
    if (this.__dynObstacles.length > 0) {
        this.__updateDynObstacleTexture(dt);
    }

    //do multiple full steps per frame to speed up some of algorithms that are slow to propagate at high mesh resolutions
    var i;
    for (i = 0; i < this.__multisteps; i++) {
        this.__step(dt);
    }

    //post step
    this.__postStepPass();

    //display pass
    this.__displayPass();
};
SKUNAMI.GpuHeightFieldWater.prototype.__step = function (dt) {

    //calculate the number of substeps needed
    var substeps = this.__calculateSubsteps(dt);
    var substepDt = dt / substeps;

    //disturb
    this.__disturbPass();

    //water sim
    var i;
    for (i = 0; i < substeps; i++) {
        this.__waterSimPass(substepDt);
    }
};
SKUNAMI.GpuHeightFieldWater.prototype.__postStepPass = function () {
    //rebind render target to water mesh to ensure vertex shader gets the right texture
    this.__mesh.material.uniforms['uTexture'].value = this.__rttRenderTarget1;
};
SKUNAMI.GpuHeightFieldWater.prototype.__swapRenderTargets = function () {
    var temp = this.__rttRenderTarget1;
    this.__rttRenderTarget1 = this.__rttRenderTarget2;
    this.__rttRenderTarget2 = temp;
    // this.__rttQuadMesh.material.uniforms['uTexture'].value = this.__rttRenderTarget2;
};
/**
 * Adds a static obstacle into the system
 * @param {THREE.Mesh} mesh Mesh to use as a static obstacle
 */
SKUNAMI.GpuHeightFieldWater.prototype.addStaticObstacle = function (mesh) {
    if (!(mesh instanceof THREE.Mesh)) {
        throw new Error('mesh must be of type THREE.Mesh');
    }

    if (!mesh.__skunami) {
        mesh.__skunami = {};
    }
    mesh.__skunami.isObstacle = true;
    mesh.__skunami.isDynamic = false;
    mesh.__skunami.mass = 0;
    this.__staticObstacles.push(mesh);

    //set a flag to indicate that we want to update static obstacle texture during update() call
    this.__shouldUpdateStaticObstacle = true;
};
/**
 * Adds a dynamic obstacle into the system
 * @param {THREE.Mesh} mesh Mesh to use as a dynamic obstacle
 * @param {number} mass Mass of the dynamic obstacle
 */
SKUNAMI.GpuHeightFieldWater.prototype.addDynamicObstacle = function (mesh, mass) {
    if (!(mesh instanceof THREE.Mesh)) {
        throw new Error('mesh must be of type THREE.Mesh');
    }
    if (typeof mass === 'undefined') {
        throw new Error('mass not specified');
    }
    if (!mesh.__skunami) {
        mesh.__skunami = {};
    }
    mesh.__skunami.isObstacle = true;
    mesh.__skunami.isDynamic = true;
    mesh.__skunami.mass = mass;
    this.__dynObstacles.push(mesh);
};
/**
 * Removes obstacle from the system
 * @param  {THREE.Mesh} mesh Mesh of the obstacle to remove
 */
SKUNAMI.GpuHeightFieldWater.prototype.removeObstacle = function (mesh) {

    //remove from dynamic obstacle array if it exists
    var i, len;
    for (i = 0, len = this.__dynObstacles.length; i < len; i++) {
        if (this.__dynObstacles[i] === mesh) {
            this.__dynObstacles.splice(i, 1);
        }
    }

    //remove from static obstacle array if it exists
    var isStaticObstacle = false;
    for (i = 0, len = this.__staticObstacles.length; i < len; i++) {
        if (this.__staticObstacles[i] === mesh) {
            this.__staticObstacles.splice(i, 1);
            isStaticObstacle = true;
        }
    }
    if (isStaticObstacle) {
        //set a flag to indicate that we want to update static obstacle texture during update() call
        this.__shouldUpdateStaticObstacle = true;
    }
};
//This should only be called during update() call. Should not be called directly.
SKUNAMI.GpuHeightFieldWater.prototype.__updateStaticObstacleTexture = function (dt) {

    //static obstacle map just needs the top height (like the terrain)

    //clear obstacle texture first
    this.__clearRenderTarget(this.__rttStaticObstaclesRenderTarget, 0.0, 0.0, 0.0, 1.0);  //set unused alpha channel to 1 so that we can see the result
    this.__clearRenderTarget(this.__rttObstacleTopRenderTarget, 0.0, 0.0, 0.0, 0.0);

    var that = this;

    //hide and reset everything in scene
    this.__scene.traverse(function (object) {
        object.visibleStore = object.visible;
        object.visible = false;
    });

    //set an override depth map material for the scene
    this.__scene.overrideMaterial = this.__rttObstaclesDepthMaterial;

    //show all static obstacles
    var i, len;
    for (i = 0, len = this.__staticObstacles.length; i < len; i++) {
        this.__staticObstacles[i].visible = true;
    }

    //render from the top view to get the top height
    this.__renderer.render(this.__scene, this.__rttObstaclesTopCamera, this.__rttObstacleTopRenderTarget, false);

    //process this depth actual height
    this.__rttQuadMesh.material = this.__staticObstaclesMaterial;
    this.__staticObstaclesMaterial.uniforms['uObstacleTopTexture'].value = this.__rttObstacleTopRenderTarget;
    this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttStaticObstaclesRenderTarget, false);

    //erode the map so that the water heights won't show at the sides of the obstacles
    this.__rttQuadMesh.material = this.__erodeMaterial;
    this.__erodeMaterial.uniforms['uTexture'].value = this.__rttStaticObstaclesRenderTarget;
    this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttStaticObstaclesRenderTarget, false);
    this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttStaticObstaclesRenderTarget, false);

    //remove scene override material
    this.__scene.overrideMaterial = null;

    //restore visibility in the scene
    this.__scene.traverse(function (object) {
        object.visible = object.visibleStore;
    });
};
SKUNAMI.GpuHeightFieldWater.prototype.__updateDynObstacleTexture = function (dt) {

    //store accumulated displaced height channel from previous frame first (by copying G channel to B channel)
    this.__rttQuadMesh.material = this.__copyChannelsMaterial;
    this.__copyChannelsMaterial.uniforms['uTexture'].value = this.__rttDynObstaclesRenderTarget;
    this.__copyChannelsMaterial.uniforms['uOriginChannelId'].value.copy(this.__channelVectors.g);
    this.__copyChannelsMaterial.uniforms['uDestChannelId'].value.copy(this.__channelVectors.b);
    this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttDynObstaclesRenderTarget, false);

    //clear obstacle textures
    this.__rttQuadMesh.material = this.__resetMaskedMaterial;
    this.__resetMaskedMaterial.uniforms['uTexture'].value = this.__rttDynObstaclesRenderTarget;
    this.__resetMaskedMaterial.uniforms['uColor'].value.set(0.0, 0.0, 0.0, 0.0);
    this.__resetMaskedMaterial.uniforms['uChannelMask'].value.set(1.0, 1.0, 0.0, 1.0);  //don't clear B channel which stores previous displaced vol
    this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttDynObstaclesRenderTarget, false);

    //combine water and terrain heights into one and then blur it
    this.__rttQuadMesh.material = this.__combineTexturesMaterial;
    this.__combineTexturesMaterial.uniforms['uTexture1'].value = this.__rttRenderTarget2;
    this.__combineTexturesMaterial.uniforms['uTexture2'].value = this.__terrainTexture;
    this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttCombinedHeightsBlurredRenderTarget, false);
    this.__rttQuadMesh.material = this.__gaussianBlurXMaterial;
    this.__gaussianBlurXMaterial.uniforms['uTexture'].value = this.__rttCombinedHeightsBlurredRenderTarget;
    this.__gaussianBlurXMaterial.uniforms['uTexelSize'].value = 1.0 / this.__res;
    this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttCombinedHeightsBlurredRenderTarget, false);
    this.__rttQuadMesh.material = this.__gaussianBlurYMaterial;
    this.__gaussianBlurYMaterial.uniforms['uTexture'].value = this.__rttCombinedHeightsBlurredRenderTarget;
    this.__gaussianBlurYMaterial.uniforms['uTexelSize'].value = 1.0 / this.__res;
    this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttCombinedHeightsBlurredRenderTarget, false);

    var that = this;

    //hide and reset everything in scene
    this.__scene.traverse(function (object) {
        object.visibleStore = object.visible;
        object.visible = false;
    });

    //set an override depth map material for the scene
    this.__scene.overrideMaterial = this.__rttObstaclesDepthMaterial;

    //render top & bottom of each obstacle and compare to current water texture
    this.__scene.traverse(function (object) {
        if (object instanceof THREE.Mesh && object.__skunami && object.__skunami.isObstacle && object.__skunami.isDynamic) {

            //show current mesh
            object.visible = true;

            //clear top and bottom render targets
            that.__clearRenderTarget(that.__rttObstacleTopRenderTarget, 0.0, 0.0, 0.0, 0.0);
            that.__clearRenderTarget(that.__rttObstacleBottomRenderTarget, 0.0, 0.0, 0.0, 0.0);

            //render top and bottom depth maps
            that.__renderer.render(that.__scene, that.__rttObstaclesTopCamera, that.__rttObstacleTopRenderTarget, false);
            that.__renderer.render(that.__scene, that.__rttObstaclesBottomCamera, that.__rttObstacleBottomRenderTarget, false);

            //update obstacle texture
            that.__rttQuadMesh.material = that.__dynObstaclesMaterial;
            that.__dynObstaclesMaterial.uniforms['uObstaclesTexture'].value = that.__rttDynObstaclesRenderTarget;
            that.__dynObstaclesMaterial.uniforms['uObstacleTopTexture'].value = that.__rttObstacleTopRenderTarget;
            that.__dynObstaclesMaterial.uniforms['uObstacleBottomTexture'].value = that.__rttObstacleBottomRenderTarget;
            that.__dynObstaclesMaterial.uniforms['uWaterTexture'].value = that.__rttCombinedHeightsBlurredRenderTarget;  //use blurred heights
            that.__dynObstaclesMaterial.uniforms['uTerrainTexture'].value = that.__emptyTexture;
            that.__renderer.render(that.__rttScene, that.__rttCamera, that.__rttDynObstaclesRenderTarget, false);

            //if object is dynamic, store additional info
            // if (object.__skunami.isDynamic) {

            //TODO: reduce the number of texture reads to speed up (getPixels() is very expensive)

            //find total water volume displaced by this object (from A channel data)
            that.__pr.reduce(that.__rttDynObstaclesRenderTarget, 'sum', 'a');
            object.__skunami.totalDisplacedVol = that.__pr.getPixelFloatData('a')[0] * that.__segmentSizeSquared;  //cubic metres

            //mask out velocity field using object's alpha
            that.__rttQuadMesh.material = that.__maskWaterMaterial;
            that.__maskWaterMaterial.uniforms['uTexture1'].value = that.__rttRenderTarget1;
            that.__maskWaterMaterial.uniforms['uTexture2'].value = that.__rttObstacleTopRenderTarget;
            that.__renderer.render(that.__rttScene, that.__rttCamera, that.__rttMaskedWaterRenderTarget, false);

            //find total horizontal velocities affecting this object
            that.__pr.reduce(that.__rttMaskedWaterRenderTarget, 'sum', 'g');
            object.__skunami.totalVelocityX = that.__pr.getPixelFloatData('g')[0];
            that.__pr.reduce(that.__rttMaskedWaterRenderTarget, 'sum', 'b');
            object.__skunami.totalVelocityZ = that.__pr.getPixelFloatData('b')[0];

            //calculate total area covered by this object
            that.__pr.reduce(that.__rttObstacleTopRenderTarget, 'sum', 'a');
            object.__skunami.totalArea = that.__pr.getPixelFloatData('a')[0];

            //calculate average velocities affecting this object
            if (object.__skunami.totalArea === 0.0) {
                object.__skunami.averageVelocityX = 0;
                object.__skunami.averageVelocityZ = 0;
            } else {
                object.__skunami.averageVelocityX = object.__skunami.totalVelocityX / object.__skunami.totalArea;
                object.__skunami.averageVelocityZ = object.__skunami.totalVelocityZ / object.__skunami.totalArea;
            }

            //calculate forces that should be exerted on this object
            object.__skunami.forceX = object.__skunami.averageVelocityX / dt * object.__skunami.mass;
            object.__skunami.forceY = object.__skunami.totalDisplacedVol * that.__density * that.__gravity;
            object.__skunami.forceZ = object.__skunami.averageVelocityZ / dt * object.__skunami.mass;

            //call exertForce callbacks
            if (that.__callbacks.hasOwnProperty('exertForce')) {
                var renderCallbacks = that.__callbacks['exertForce'];
                var i, len;
                for (i = 0, len = renderCallbacks.length; i < len; i++) {
                    renderCallbacks[i](object, new THREE.Vector3(object.__skunami.forceX, object.__skunami.forceY, object.__skunami.forceZ));
                }
            }

            // }

            //hide current mesh
            object.visible = false;
        }
    });

    //remove scene override material
    this.__scene.overrideMaterial = null;

    //restore visibility in the scene
    this.__scene.traverse(function (object) {
        object.visible = object.visibleStore;
    });

    //---------------------------------------------
    //calculate rigid bodies' influence on water:
    //---------------------------------------------

    //blur the obstacles map
    this.__rttQuadMesh.material = this.__gaussianBlurXMaterial;
    this.__gaussianBlurXMaterial.uniforms['uTexture'].value = this.__rttDynObstaclesRenderTarget;
    this.__gaussianBlurXMaterial.uniforms['uTexelSize'].value = 1.0 / this.__res;
    this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttDynObstaclesBlurredRenderTarget, false);  //need to render to another target to avoid corrupting original accumulated
    this.__rttQuadMesh.material = this.__gaussianBlurYMaterial;
    this.__gaussianBlurYMaterial.uniforms['uTexture'].value = this.__rttDynObstaclesBlurredRenderTarget;
    this.__gaussianBlurYMaterial.uniforms['uTexelSize'].value = 1.0 / this.__res;
    this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttDynObstaclesBlurredRenderTarget, false);

    //calculate a map with additional heights to disturb water, based on differences in water volumes between frames
    this.__rttQuadMesh.material = this.__calcDisturbMapMaterial;
    this.__calcDisturbMapMaterial.uniforms['uTexture'].value = this.__rttDynObstaclesBlurredRenderTarget;  //use blurred obstacle maps
    this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttDisturbMapRenderTarget, false);
    this.__disturbMapHasUpdated = true;

};
//Returns the pixel unsigned byte data for the render target texture (readPixels() can only return unsigned byte data)
SKUNAMI.GpuHeightFieldWater.prototype.__getPixelByteDataForRenderTarget = function (renderTarget, pixelByteData, width, height) {

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
SKUNAMI.GpuHeightFieldWater.prototype.__getPixelEncodedByteData = function (renderTarget, pixelByteData, channelId, width, height) {

    //encode the float data into an unsigned byte RGBA texture
    this.__rttQuadMesh.material = this.__rttEncodeFloatMaterial;
    this.__rttEncodeFloatMaterial.uniforms['uTexture'].value = renderTarget;
    this.__rttEncodeFloatMaterial.uniforms['uChannelMask'].value.copy(this.__channelVectors[channelId]);
    this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttFloatEncoderRenderTarget, false);

    this.__getPixelByteDataForRenderTarget(this.__rttFloatEncoderRenderTarget, pixelByteData, width, height);
};
/**
 * Returns the pixel float data for the water textures<br/><strong>NOTE: This is an expensive operation.</strong>
 * @return {Float32Array} Float data of the water texture
 */
SKUNAMI.GpuHeightFieldWater.prototype.getPixelFloatData = function () {

    //get the encoded byte data first
    this.__getPixelEncodedByteData(this.__rttRenderTarget1, this.__pixelByteData, 'r', this.__res, this.__res);

    //cast to float
    var pixelFloatData = new Float32Array(this.__pixelByteData.buffer);
    return pixelFloatData;
};
/**
 * Adds callback function that is executed at specific times
 * @param {string} type Type of callback: 'exertForce' (only choice available now)
 * @param {function} callbackFn Callback function
 */
SKUNAMI.GpuHeightFieldWater.prototype.addCallback = function (type, callbackFn) {
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
 * Gets the water texture that is used for displacement of mesh
 * @return {THREE.WebGLRenderTarget} Water texture that is used for displacement of mesh
 */
SKUNAMI.GpuHeightFieldWater.prototype.getWaterDisplayTexture = function () {
    return this.__rttWaterDisplay;
};
/**
 * Gets the obstacle texture
 * @return {THREE.WebGLRenderTarget} Obstacles texture
 */
SKUNAMI.GpuHeightFieldWater.prototype.getObstaclesDisplayTexture = function () {
    return this.__rttObstaclesDisplay;
};

/**
 * Abstract base class for GPU height field surface water simulations
 * @constructor
 * @abstract
 * @extends {SKUNAMI.GpuHeightFieldWater}
 */
SKUNAMI.GpuHeightFieldSurfaceWater = function (options) {
    this.__meanHeight = options.meanHeight || 0;
    SKUNAMI.GpuHeightFieldWater.call(this, options);
};
//inherit
SKUNAMI.GpuHeightFieldSurfaceWater.prototype = Object.create(SKUNAMI.GpuHeightFieldWater.prototype);
SKUNAMI.GpuHeightFieldSurfaceWater.prototype.constructor = SKUNAMI.GpuHeightFieldSurfaceWater;
//override
/**
 * Floods the scene by the given volume
 * @param  {number} volume Volume of water to flood the scene with, in cubic scene units
 */
SKUNAMI.GpuHeightFieldSurfaceWater.prototype.flood = function (volume) {
    this.__meanHeight += volume / (this.__size * this.__size);
};
//methods
/**
 * Gets mean height
 * @returns {number} Mean height
 */
SKUNAMI.GpuHeightFieldSurfaceWater.prototype.getMeanHeight = function () {
    return this.__meanHeight;
};
/**
 * Sets mean height
 * @param {number} value Mean height
 */
SKUNAMI.GpuHeightFieldSurfaceWater.prototype.setMeanHeight = function (value) {
    this.__meanHeight = value;
};

/**
 * GPU height field water simulation based on "Fast Water Simulation for Games Using Height Fields" (Matthias Mueller-Fisher, GDC2008)
 * @constructor
 * @extends {SKUNAMI.GpuHeightFieldSurfaceWater}
 * @param {object} options Options
 * @param {THREE.WebGLRenderer} options.renderer Three.js WebGL renderer
 * @param {THREE.Scene} options.scene Three.js scene
 * @param {THREE.Mesh} options.mesh Three.js mesh for sculpting
 * @param {number} options.size Size of mesh
 * @param {number} options.res Resolution of mesh
 * @param {number} options.dampingFactor Damping factor for the sim
 * @param {number} options.horizontalSpeed Horizontal speed
 * @param {number} [options.multiSteps=1] Number of full steps to take per frame, to speed up some of algorithms that are slow to propagate at high mesh resolutions
 * @param {number} [options.meanHeight=0] Mean height of the water simulation
 * @param {number} [options.density=1000] Density of water (kg per cubic metres)
 */
SKUNAMI.GpuMuellerGdc2008Water = function (options) {

    if (typeof options.horizontalSpeed === 'undefined') {
        throw new Error('horizontalSpeed not specified');
    }
    this.__horizontalSpeed = options.horizontalSpeed;

    SKUNAMI.GpuHeightFieldSurfaceWater.call(this, options);

    this.__maxDt = this.__segmentSize / this.__horizontalSpeed;  //based on CFL condition
};
//inherit
SKUNAMI.GpuMuellerGdc2008Water.prototype = Object.create(SKUNAMI.GpuHeightFieldSurfaceWater.prototype);
SKUNAMI.GpuMuellerGdc2008Water.prototype.constructor = SKUNAMI.GpuMuellerGdc2008Water;
//override
SKUNAMI.GpuMuellerGdc2008Water.prototype.__getWaterFragmentShaderContent = function () {
    return this.__shaders.frag['hfWater_muellerGdc2008'];
};
SKUNAMI.GpuMuellerGdc2008Water.prototype.__setupShaders = function () {
    SKUNAMI.GpuHeightFieldSurfaceWater.prototype.__setupShaders.call(this);

    //add uHorizontalSpeed into the uniforms
    this.__waterSimMaterial.uniforms['uHorizontalSpeed'] = { type: 'f', value: this.__horizontalSpeed };
};
SKUNAMI.GpuMuellerGdc2008Water.prototype.__calculateSubsteps = function (dt) {
    return Math.ceil(1.5 * dt / this.__maxDt);  //not always stable without a multiplier (using 1.5 now)
};

/**
 * GPU height field water simulation based on HelloWorld code of "Fast Water Simulation for Games Using Height Fields" (Matthias Mueller-Fisher, GDC2008)
 * @constructor
 * @extends {SKUNAMI.GpuHeightFieldSurfaceWater}
 * @param {object} options Options
 * @param {THREE.WebGLRenderer} options.renderer Three.js WebGL renderer
 * @param {THREE.Scene} options.scene Three.js scene
 * @param {THREE.Mesh} options.mesh Three.js mesh for sculpting
 * @param {number} options.size Size of mesh
 * @param {number} options.res Resolution of mesh
 * @param {number} options.dampingFactor Damping factor for the sim
 * @param {number} [options.multiSteps=1] Number of full steps to take per frame, to speed up some of algorithms that are slow to propagate at high mesh resolutions
 * @param {number} [options.meanHeight=0] Mean height of the water simulation
 * @param {number} [options.density=1000] Density of water (kg per cubic metres)
 */
SKUNAMI.GpuMuellerGdc2008HwWater = function (options) {
    SKUNAMI.GpuHeightFieldSurfaceWater.call(this, options);
};
//inherit
SKUNAMI.GpuMuellerGdc2008HwWater.prototype = Object.create(SKUNAMI.GpuHeightFieldSurfaceWater.prototype);
SKUNAMI.GpuMuellerGdc2008HwWater.prototype.constructor = SKUNAMI.GpuMuellerGdc2008HwWater;
//override
SKUNAMI.GpuMuellerGdc2008HwWater.prototype.__getWaterFragmentShaderContent = function () {
    return this.__shaders.frag['hfWater_muellerGdc2008Hw'];
};

/**
 * GPU height field water simulation based on {@link http://freespace.virgin.net/hugo.elias/graphics/x_water.htm}
 * @constructor
 * @extends {SKUNAMI.GpuHeightFieldSurfaceWater}
 * @param {object} options Options
 * @param {THREE.WebGLRenderer} options.renderer Three.js WebGL renderer
 * @param {THREE.Scene} options.scene Three.js scene
 * @param {THREE.Mesh} options.mesh Three.js mesh for sculpting
 * @param {number} options.size Size of mesh
 * @param {number} options.res Resolution of mesh
 * @param {number} options.dampingFactor Damping factor for the sim
 * @param {number} [options.multiSteps=1] Number of full steps to take per frame, to speed up some of algorithms that are slow to propagate at high mesh resolutions
 * @param {number} [options.meanHeight=0] Mean height of the water simulation
 * @param {number} [options.density=1000] Density of water (kg per cubic metres)
 */
SKUNAMI.GpuXWater = function (options) {
    SKUNAMI.GpuHeightFieldSurfaceWater.call(this, options);
};
//inherit
SKUNAMI.GpuXWater.prototype = Object.create(SKUNAMI.GpuHeightFieldSurfaceWater.prototype);
SKUNAMI.GpuXWater.prototype.constructor = SKUNAMI.GpuXWater;
//override
SKUNAMI.GpuXWater.prototype.__getWaterFragmentShaderContent = function () {
    return this.__shaders.frag['hfWater_xWater'];
};

/**
 * GPU height field water simulation based on "Interactive Water Surfaces" (Jerry Tessendorf, Game Programming Gems 4)
 * @constructor
 * @extends {SKUNAMI.GpuHeightFieldSurfaceWater}
 * @param {object} options Options
 * @param {THREE.WebGLRenderer} options.renderer Three.js WebGL renderer
 * @param {THREE.Scene} options.scene Three.js scene
 * @param {THREE.Mesh} options.mesh Three.js mesh for sculpting
 * @param {number} options.size Size of mesh
 * @param {number} options.res Resolution of mesh
 * @param {number} options.dampingFactor Damping factor for the sim
 * @param {number} [options.multiSteps=1] Number of full steps to take per frame, to speed up some of algorithms that are slow to propagate at high mesh resolutions
 * @param {number} [options.meanHeight=0] Mean height of the water simulation
 * @param {number} [options.density=1000] Density of water (kg per cubic metres)
 */
SKUNAMI.GpuTessendorfIWaveWater = function (options) {

    //not giving user the choice of kernel size.
    //wanted to use 6 as recommended, but that doesn't work well with mesh res of 256 (ripples look like they go inwards rather than outwards).
    //radius of 2 seems to work ok for mesh 256.
    this.__kernelRadius = 2;

    SKUNAMI.GpuHeightFieldSurfaceWater.call(this, options);

    this.__loadKernelTexture();
};
//inherit
SKUNAMI.GpuTessendorfIWaveWater.prototype = Object.create(SKUNAMI.GpuHeightFieldSurfaceWater.prototype);
SKUNAMI.GpuTessendorfIWaveWater.prototype.constructor = SKUNAMI.GpuTessendorfIWaveWater;
//override
SKUNAMI.GpuTessendorfIWaveWater.prototype.__getWaterFragmentShaderContent = function () {
    return this.__shaders.frag['hfWater_tessendorfIWave'];
};
SKUNAMI.GpuTessendorfIWaveWater.prototype.__setupShaders = function () {

    SKUNAMI.GpuHeightFieldSurfaceWater.prototype.__setupShaders.call(this);

    this.__convolveMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uWaterTexture: { type: 't', value: this.__emptyTexture },
            uTexelSize: { type: 'v2', value: new THREE.Vector2(this.__texelSize, this.__texelSize) },
            uKernel: { type: "fv1", value: this.__kernelData }
        },
        vertexShader: this.__shaders.vert['passUv'],
        fragmentShader: this.__shaders.frag['hfWater_tessendorfIWave_convolve']
    });

    this.__waterSimMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uWaterTexture: { type: 't', value: this.__emptyTexture },
            uTwoMinusDampTimesDt: { type: 'f', value: 0.0 },
            uOnePlusDampTimesDt: { type: 'f', value: 0.0 },
            uGravityTimesDtTimesDt: { type: 'f', value: 0.0 },
            uMeanHeight: { type: 'f', value: this.__meanHeight }
        },
        vertexShader: this.__shaders.vert['passUv'],
        fragmentShader: this.__getWaterFragmentShaderContent()
    });
};
SKUNAMI.GpuTessendorfIWaveWater.prototype.__waterSimPass = function (substepDt) {

    //convolve
    this.__rttQuadMesh.material = this.__convolveMaterial;
    this.__convolveMaterial.uniforms['uWaterTexture'].value = this.__rttRenderTarget2;
    this.__convolveMaterial.uniforms['uKernel'].value = this.__kernelData;
    this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttRenderTarget1, false);
    this.__swapRenderTargets();

    //water sim
    this.__rttQuadMesh.material = this.__waterSimMaterial;
    this.__waterSimMaterial.uniforms['uWaterTexture'].value = this.__rttRenderTarget2;
    this.__waterSimMaterial.uniforms['uTwoMinusDampTimesDt'].value = 2.0 - this.__dampingFactor * substepDt;
    this.__waterSimMaterial.uniforms['uOnePlusDampTimesDt'].value = 1.0 + this.__dampingFactor * substepDt;
    this.__waterSimMaterial.uniforms['uGravityTimesDtTimesDt'].value = -this.__gravity * substepDt * substepDt;
    this.__waterSimMaterial.uniforms['uMeanHeight'].value = this.__meanHeight;
    this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttRenderTarget1, false);
    this.__swapRenderTargets();

};
//data
SKUNAMI.GpuTessendorfIWaveWater.prototype.__kernels = {

    2: {
        "0": {
            "0": 1.0,
            "1": 0.67827660633313791,
            "2": 0.15642080318487095,
            "-1": 0.67827660633313791,
            "-2": 0.15642080318487095
        },
        "1": {
            "0": 0.67827660633313791,
            "1": 0.44456489541854272,
            "2": 0.072257536168982492,
            "-1": 0.44456489541854272,
            "-2": 0.072257536168982492
        },
        "2": {
            "0": 0.15642080318487095,
            "1": 0.072257536168982492,
            "2": -0.049938776894223477,
            "-1": 0.072257536168982492,
            "-2": -0.049938776894223477
        },
        "-1": {
            "0": 0.67827660633313791,
            "1": 0.44456489541854272,
            "2": 0.072257536168982492,
            "-1": 0.44456489541854272,
            "-2": 0.072257536168982492
        },
        "-2": {
            "0": 0.15642080318487095,
            "1": 0.072257536168982492,
            "2": -0.049938776894223477,
            "-1": 0.072257536168982492,
            "-2": -0.049938776894223477
        }
    },

    6: {
        "0": {
            "0": 1.0,
            "1": 0.67827660633313791,
            "2": 0.15642080318487095,
            "3": -0.065327390570961569,
            "4": -0.06444781066526209,
            "5": -0.031433210050842826,
            "6": -0.014956820349629208,
            "-2": 0.15642080318487095,
            "-6": -0.014956820349629208,
            "-5": -0.031433210050842826,
            "-4": -0.06444781066526209,
            "-3": -0.065327390570961569,
            "-1": 0.67827660633313791
        },
        "1": {
            "0": 0.67827660633313791,
            "1": 0.44456489541854272,
            "2": 0.072257536168982492,
            "3": -0.073774850743644649,
            "4": -0.059964799734097914,
            "5": -0.029072820004281557,
            "6": -0.014159108191184992,
            "-2": 0.072257536168982492,
            "-6": -0.014159108191184992,
            "-5": -0.029072820004281557,
            "-4": -0.059964799734097914,
            "-3": -0.073774850743644649,
            "-1": 0.44456489541854272
        },
        "2": {
            "0": 0.15642080318487095,
            "1": 0.072257536168982492,
            "2": -0.049938776894223477,
            "3": -0.075937865123835754,
            "4": -0.047262518792478211,
            "5": -0.023276902009199931,
            "6": -0.012144644038531688,
            "-2": -0.049938776894223477,
            "-6": -0.012144644038531688,
            "-5": -0.023276902009199931,
            "-4": -0.047262518792478211,
            "-3": -0.075937865123835754,
            "-1": 0.072257536168982492
        },
        "3": {
            "0": -0.065327390570961569,
            "1": -0.073774850743644649,
            "2": -0.075937865123835754,
            "3": -0.055537014106713647,
            "4": -0.031433210050842826,
            "5": -0.016789615952969669,
            "6": -0.0097042154845355822,
            "-2": -0.075937865123835754,
            "-6": -0.0097042154845355822,
            "-5": -0.016789615952969669,
            "-4": -0.031433210050842826,
            "-3": -0.055537014106713647,
            "-1": -0.073774850743644649
        },
        "4": {
            "0": -0.06444781066526209,
            "1": -0.059964799734097914,
            "2": -0.047262518792478211,
            "3": -0.031433210050842826,
            "4": -0.019006732548424117,
            "5": -0.011577903734318462,
            "6": -0.007455793802651235,
            "-2": -0.047262518792478211,
            "-6": -0.007455793802651235,
            "-5": -0.011577903734318462,
            "-4": -0.019006732548424117,
            "-3": -0.031433210050842826,
            "-1": -0.059964799734097914
        },
        "5": {
            "0": -0.031433210050842826,
            "1": -0.029072820004281557,
            "2": -0.023276902009199931,
            "3": -0.016789615952969669,
            "4": -0.011577903734318462,
            "5": -0.0079990693931909686,
            "6": -0.0056408890389552952,
            "-2": -0.023276902009199931,
            "-6": -0.0056408890389552952,
            "-5": -0.0079990693931909686,
            "-4": -0.011577903734318462,
            "-3": -0.016789615952969669,
            "-1": -0.029072820004281557
        },
        "6": {
            "0": -0.014956820349629208,
            "1": -0.014159108191184992,
            "2": -0.012144644038531688,
            "3": -0.0097042154845355822,
            "4": -0.007455793802651235,
            "5": -0.0056408890389552952,
            "6": -0.0042622070432495182,
            "-2": -0.012144644038531688,
            "-6": -0.0042622070432495182,
            "-5": -0.0056408890389552952,
            "-4": -0.007455793802651235,
            "-3": -0.0097042154845355822,
            "-1": -0.014159108191184992
        },
        "-2": {
            "0": 0.15642080318487095,
            "1": 0.072257536168982492,
            "2": -0.049938776894223477,
            "3": -0.075937865123835754,
            "4": -0.047262518792478211,
            "5": -0.023276902009199931,
            "6": -0.012144644038531688,
            "-2": -0.049938776894223477,
            "-6": -0.012144644038531688,
            "-5": -0.023276902009199931,
            "-4": -0.047262518792478211,
            "-3": -0.075937865123835754,
            "-1": 0.072257536168982492
        },
        "-6": {
            "0": -0.014956820349629208,
            "1": -0.014159108191184992,
            "2": -0.012144644038531688,
            "3": -0.0097042154845355822,
            "4": -0.007455793802651235,
            "5": -0.0056408890389552952,
            "6": -0.0042622070432495182,
            "-2": -0.012144644038531688,
            "-6": -0.0042622070432495182,
            "-5": -0.0056408890389552952,
            "-4": -0.007455793802651235,
            "-3": -0.0097042154845355822,
            "-1": -0.014159108191184992
        },
        "-5": {
            "0": -0.031433210050842826,
            "1": -0.029072820004281557,
            "2": -0.023276902009199931,
            "3": -0.016789615952969669,
            "4": -0.011577903734318462,
            "5": -0.0079990693931909686,
            "6": -0.0056408890389552952,
            "-2": -0.023276902009199931,
            "-6": -0.0056408890389552952,
            "-5": -0.0079990693931909686,
            "-4": -0.011577903734318462,
            "-3": -0.016789615952969669,
            "-1": -0.029072820004281557
        },
        "-4": {
            "0": -0.06444781066526209,
            "1": -0.059964799734097914,
            "2": -0.047262518792478211,
            "3": -0.031433210050842826,
            "4": -0.019006732548424117,
            "5": -0.011577903734318462,
            "6": -0.007455793802651235,
            "-2": -0.047262518792478211,
            "-6": -0.007455793802651235,
            "-5": -0.011577903734318462,
            "-4": -0.019006732548424117,
            "-3": -0.031433210050842826,
            "-1": -0.059964799734097914
        },
        "-3": {
            "0": -0.065327390570961569,
            "1": -0.073774850743644649,
            "2": -0.075937865123835754,
            "3": -0.055537014106713647,
            "4": -0.031433210050842826,
            "5": -0.016789615952969669,
            "6": -0.0097042154845355822,
            "-2": -0.075937865123835754,
            "-6": -0.0097042154845355822,
            "-5": -0.016789615952969669,
            "-4": -0.031433210050842826,
            "-3": -0.055537014106713647,
            "-1": -0.073774850743644649
        },
        "-1": {
            "0": 0.67827660633313791,
            "1": 0.44456489541854272,
            "2": 0.072257536168982492,
            "3": -0.073774850743644649,
            "4": -0.059964799734097914,
            "5": -0.029072820004281557,
            "6": -0.014159108191184992,
            "-2": 0.072257536168982492,
            "-6": -0.014159108191184992,
            "-5": -0.029072820004281557,
            "-4": -0.059964799734097914,
            "-3": -0.073774850743644649,
            "-1": 0.44456489541854272
        }
    }

};
//methods
SKUNAMI.GpuTessendorfIWaveWater.prototype.__loadKernelTexture = function () {

    //load this.__G from json file
    // var url = '../kernels/iWave_kernels_' + this.__kernelRadius + '.json';
    // var that = this;
    // $.ajax({
        // url: url,
        // async: false
    // }).done(function (data) {
        // that.__G = data;
    // }).error(function (xhr, textStatus, error) {
        // throw new Error('error loading ' + url + ': ' + error);
    // });

    this.__G = this.__kernels[this.__kernelRadius];
    if (typeof this.__G === 'undefined') {
        throw new Error('Unable to load iWave kernel with radius: ' + this.__kernelRadius);
    }

    //create a data texture from G
    var twoTimesKernelPlusOne = 2 * this.__kernelRadius + 1;
    this.__kernelData = new Float32Array(twoTimesKernelPlusOne * twoTimesKernelPlusOne);
    var idxX, idxY, idx, value, y;
    for (idxY in this.__G) {
        if (this.__G.hasOwnProperty(idxY)) {
            y = this.__G[idxY];
            for (idxX in y) {
                if (y.hasOwnProperty(idxX)) {
                    value = y[idxX];
                    idx = (parseInt(idxY, 10) + this.__kernelRadius) * twoTimesKernelPlusOne + (parseInt(idxX, 10) + this.__kernelRadius);
                    this.__kernelData[idx] = value;
                }
            }
        }
    }

};

/**
 * GPU height field water based on the hydrostatic pipe model ("Fast Hydraulic Erosion Simulation and Visualization on GPU", Xing Mei, Philippe Decaudin and Bao-Gang Hu, Pacific Graphics 2007)
 * @constructor
 * @extends {SKUNAMI.GpuHeightFieldWater}
 * @param {object} options Options
 * @param {THREE.WebGLRenderer} options.renderer Three.js WebGL renderer
 * @param {THREE.Scene} options.scene Three.js scene
 * @param {THREE.Mesh} options.mesh Three.js mesh for sculpting
 * @param {number} options.size Size of mesh
 * @param {number} options.res Resolution of mesh
 * @param {number} options.dampingFactor Damping factor for the sim
 * @param {number} [options.multiSteps=1] Number of full steps to take per frame, to speed up some of algorithms that are slow to propagate at high mesh resolutions
 * @param {THREE.WebGLRenderTarget} [options.terrainTexture=null] Terrain texture that creates a base height which affects the water
 * @param {number} [options.initialWaterHeight=0] Initial height of water that is above the terrain
 * @param {number} [options.density=1000] Density of water (kg per cubic metres)
 */
SKUNAMI.GpuPipeModelWater = function (options) {

    this.__minWaterHeight = -0.05;
    this.__initialWaterHeight = options.initialWaterHeight || 0.0;
    this.__initialWaterHeight += this.__minWaterHeight;

    SKUNAMI.GpuHeightFieldWater.call(this, options);

    this.__terrainTexture = options.terrainTexture || this.__emptyTexture;

    this.__isSourcing = false;
    this.__sourceUvPos = new THREE.Vector2();
    this.__sourceAmount = 0;
    this.__sourceRadius = 0.0025 * this.__size;

    //some constants
    this.__atmosPressure = 0;  //assume one constant atmos pressure throughout
    this.__pipeLength = this.__segmentSize;
    this.__pipeCrossSectionArea = this.__pipeLength * this.__pipeLength;  //square cross-section area
    this.__pipeCrossSectionArea *= this.__res / 10;  //scale according to resolution
    this.__heightToFluxFactorNoDt = this.__pipeCrossSectionArea * this.__gravity / this.__pipeLength;

    this.__maxHorizontalSpeed = 10.0;  //just an arbitrary upper-bound estimate //TODO: link this to cross-section area
    this.__maxDt = this.__segmentSize / this.__maxHorizontalSpeed;  //based on CFL condition

};
//inherit
SKUNAMI.GpuPipeModelWater.prototype = Object.create(SKUNAMI.GpuHeightFieldWater.prototype);
SKUNAMI.GpuPipeModelWater.prototype.constructor = SKUNAMI.GpuPipeModelWater;
//override
SKUNAMI.GpuPipeModelWater.prototype.__getWaterFragmentShaderContent = function () {
    return this.__shaders.frag['hfWater_pipeModel'];
};
SKUNAMI.GpuPipeModelWater.prototype.__setupShaders = function () {

    SKUNAMI.GpuHeightFieldWater.prototype.__setupShaders.call(this);

    this.__waterSimMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTerrainTexture: { type: 't', value: this.__emptyTexture },
            uWaterTexture: { type: 't', value: this.__emptyTexture },
            uFluxTexture: { type: 't', value: this.__emptyTexture },
            uStaticObstaclesTexture: { type: 't', value: this.__emptyTexture },
            uBoundaryTexture: { type: 't', value: this.__emptyTexture },
            uTexelSize: { type: 'v2', value: new THREE.Vector2(this.__texelSize, this.__texelSize) },
            uDampingFactor: { type: 'f', value: this.__dampingFactor },
            uHeightToFluxFactor: { type: 'f', value: 0.0 },
            uSegmentSizeSquared: { type: 'f', value: this.__segmentSizeSquared },
            uDt: { type: 'f', value: 0.0 },
            uMinWaterHeight: { type: 'f', value: this.__minWaterHeight }
        },
        vertexShader: this.__shaders.vert['passUv'],
        fragmentShader: this.__shaders.frag['hfWater_pipeModel_calcFlux']
    });

    this.__waterSimMaterial2 = new THREE.ShaderMaterial({
        uniforms: {
            uWaterTexture: { type: 't', value: this.__emptyTexture },
            uFluxTexture: { type: 't', value: this.__emptyTexture },
            uTexelSize: { type: 'v2', value: new THREE.Vector2(this.__texelSize, this.__texelSize) },
            uSegmentSize: { type: 'f', value: this.__segmentSize },
            uDt: { type: 'f', value: 0.0 },
            uMinWaterHeight: { type: 'f', value: this.__minWaterHeight }
        },
        vertexShader: this.__shaders.vert['passUv'],
        fragmentShader: this.__getWaterFragmentShaderContent()
    });

    this.__calcFinalWaterHeightMaterial = new THREE.ShaderMaterial({
        uniforms: {
            uTerrainTexture: { type: 't', value: this.__emptyTexture },
            uStaticObstaclesTexture: { type: 't', value: this.__emptyTexture },
            uWaterTexture: { type: 't', value: this.__emptyTexture },
            uMultiplyTexture: { type: 't', value: this.__emptyTexture },
            uMaskOffset: { type: 'f', value: this.__minWaterHeight }
        },
        vertexShader: this.__shaders.vert['passUv'],
        fragmentShader: this.__shaders.frag['hfWater_pipeModel_calcFinalWaterHeight']
    });

    //add flood uniforms into disturb material
    this.__disturbAndSourceMaterial.uniforms['uUseObstacleTexture'].value = false;
    this.__disturbAndSourceMaterial.uniforms['uIsFlooding'] = { type: 'i', value: 0 };
    this.__disturbAndSourceMaterial.uniforms['uFloodAmount'] = { type: 'f', value: this.__floodAmount };
};
SKUNAMI.GpuPipeModelWater.prototype.__setupRttRenderTargets = function () {

    SKUNAMI.GpuHeightFieldWater.prototype.__setupRttRenderTargets.call(this);

    //create RTT render targets for flux (we need two to do feedback)
    if (this.__supportsTextureFloatLinear) {
        this.__rttRenderTargetFlux1 = new THREE.WebGLRenderTarget(this.__res, this.__res, this.__linearFloatRgbaParams);
    } else {
        this.__rttRenderTargetFlux1 = new THREE.WebGLRenderTarget(this.__res, this.__res, this.__nearestFloatRgbaParams);
    }
    this.__rttRenderTargetFlux1.generateMipmaps = false;
    this.__clearRenderTarget(this.__rttRenderTargetFlux1, 0.0, 0.0, 0.0, 0.0);  //clear render target (necessary for FireFox)
    this.__rttRenderTargetFlux2 = this.__rttRenderTargetFlux1.clone();
    this.__clearRenderTarget(this.__rttRenderTargetFlux2, 0.0, 0.0, 0.0, 0.0);  //clear render target (necessary for FireFox)

    //create another RTT render target for storing the combined terrain + water heights
    this.__rttCombinedHeight = this.__rttRenderTarget1.clone();
    this.__clearRenderTarget(this.__rttCombinedHeight, 0.0, 0.0, 0.0, 0.0);  //clear render target (necessary for FireFox)
};
/**
 * Sources water into the simulation and causes water level to rise.
 * This is different from {@linkcode SKUNAMI.GpuHeightFieldWater#disturb disturb} which is meant to only create small ripples on the water surface.
 * A negative amount will create a sink which removes water from the simulation and causes water level to fall.
 * @param  {THREE.Vector3} position World-space position to source at
 * @param  {number} amount Amount of water to source. A negative amount removes water from the system.
 * @param  {number} radius Radius of water to source
 */
SKUNAMI.GpuPipeModelWater.prototype.source = function (position, amount, radius) {
    this.__isSourcing = true;
    this.__sourceUvPos.x = (position.x + this.__halfSize) / this.__size;
    this.__sourceUvPos.y = (position.z + this.__halfSize) / this.__size;
    this.__sourceAmount = amount;
    this.__sourceRadius = radius;
};
/**
 * Floods the scene by the given volume
 * @param  {number} volume Volume of water to flood the scene with, in cubic scene units
 */
SKUNAMI.GpuPipeModelWater.prototype.flood = function (volume) {
    this.__isFlooding = true;
    this.__floodAmount = volume / (this.__size * this.__size);
};
SKUNAMI.GpuPipeModelWater.prototype.__disturbPass = function () {
    var shouldRender = false;
    if (this.__disturbMapHasUpdated) {
        // this.__disturbAndSourceMaterial.uniforms['uStaticObstaclesTexture'].value = this.__rttDynObstaclesRenderTarget;
        this.__disturbAndSourceMaterial.uniforms['uDisturbTexture'].value = this.__rttDisturbMapRenderTarget;
        shouldRender = true;
    }
    if (this.__isDisturbing && this.__disturbAmount !== 0.0) {
        this.__disturbAndSourceMaterial.uniforms['uIsDisturbing'].value = this.__isDisturbing;
        this.__disturbAndSourceMaterial.uniforms['uDisturbPos'].value.copy(this.__disturbUvPos);
        this.__disturbAndSourceMaterial.uniforms['uDisturbAmount'].value = this.__disturbAmount;
        this.__disturbAndSourceMaterial.uniforms['uDisturbRadius'].value = this.__disturbRadius / this.__size;
        shouldRender = true;
    }
    if (this.__isSourcing && this.__sourceAmount !== 0.0) {
        this.__disturbAndSourceMaterial.uniforms['uIsSourcing'].value = this.__isSourcing;
        this.__disturbAndSourceMaterial.uniforms['uSourcePos'].value.copy(this.__sourceUvPos);
        this.__disturbAndSourceMaterial.uniforms['uSourceAmount'].value = this.__sourceAmount;
        this.__disturbAndSourceMaterial.uniforms['uSourceRadius'].value = this.__sourceRadius / this.__size;
        shouldRender = true;
    }
    if (this.__isFlooding && this.__floodAmount !== 0.0) {
        this.__disturbAndSourceMaterial.uniforms['uIsFlooding'].value = this.__isFlooding;
        this.__disturbAndSourceMaterial.uniforms['uFloodAmount'].value = this.__floodAmount;
        shouldRender = true;
    }
    if (shouldRender) {
        this.__rttQuadMesh.material = this.__disturbAndSourceMaterial;
        this.__disturbAndSourceMaterial.uniforms['uTexture'].value = this.__rttRenderTarget2;
        this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttRenderTarget1, false);
        this.__swapRenderTargets();

        this.__disturbMapHasUpdated = false;
        this.__disturbAndSourceMaterial.uniforms['uDisturbTexture'].value = this.__emptyTexture;
        this.__isDisturbing = false;
        this.__disturbAndSourceMaterial.uniforms['uIsDisturbing'].value = false;
        this.__isSourcing = false;
        this.__disturbAndSourceMaterial.uniforms['uIsSourcing'].value = false;
        this.__isFlooding = false;
        this.__disturbAndSourceMaterial.uniforms['uIsFlooding'].value = false;
    }
};
SKUNAMI.GpuPipeModelWater.prototype.__calculateSubsteps = function (dt) {
    return Math.ceil(5.0 * dt / this.__maxDt);  //not always stable without a multiplier
};
SKUNAMI.GpuPipeModelWater.prototype.__resetPass = function () {
    //init rttRenderTarget2 to initial height value
    this.__clearRenderTarget(this.__rttRenderTarget2, this.__initialWaterHeight, this.__initialWaterHeight, this.__initialWaterHeight, this.__initialWaterHeight);

    //init all channels of flux texture to 0.0
    this.__clearRenderTarget(this.__rttRenderTargetFlux2, 0.0, 0.0, 0.0, 0.0);
};
SKUNAMI.GpuPipeModelWater.prototype.__waterSimPass = function (substepDt) {

    //calculate flux
    this.__rttQuadMesh.material = this.__waterSimMaterial;
    this.__waterSimMaterial.uniforms['uTerrainTexture'].value = this.__terrainTexture;
    this.__waterSimMaterial.uniforms['uWaterTexture'].value = this.__rttRenderTarget2;
    this.__waterSimMaterial.uniforms['uFluxTexture'].value = this.__rttRenderTargetFlux2;
    this.__waterSimMaterial.uniforms['uStaticObstaclesTexture'].value = this.__rttStaticObstaclesRenderTarget;
    this.__waterSimMaterial.uniforms['uBoundaryTexture'].value = this.__boundaryTexture;
    this.__waterSimMaterial.uniforms['uHeightToFluxFactor'].value = this.__heightToFluxFactorNoDt * substepDt;
    this.__waterSimMaterial.uniforms['uDt'].value = substepDt;
    this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttRenderTargetFlux1, false);
    this.__swapFluxRenderTargets();

    //water sim
    this.__rttQuadMesh.material = this.__waterSimMaterial2;
    this.__waterSimMaterial2.uniforms['uWaterTexture'].value = this.__rttRenderTarget2;
    this.__waterSimMaterial2.uniforms['uFluxTexture'].value = this.__rttRenderTargetFlux2;
    this.__waterSimMaterial2.uniforms['uDt'].value = substepDt;
    this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttRenderTarget1, false);
    this.__swapRenderTargets();

};
SKUNAMI.GpuPipeModelWater.prototype.__postStepPass = function () {

    //combine terrain, static obstacle and water heights
    this.__rttQuadMesh.material = this.__calcFinalWaterHeightMaterial;
    this.__calcFinalWaterHeightMaterial.uniforms['uTerrainTexture'].value = this.__terrainTexture;
    this.__calcFinalWaterHeightMaterial.uniforms['uStaticObstaclesTexture'].value = this.__rttStaticObstaclesRenderTarget;
    this.__calcFinalWaterHeightMaterial.uniforms['uWaterTexture'].value = this.__rttRenderTarget2;
    this.__calcFinalWaterHeightMaterial.uniforms['uMultiplyTexture'].value = this.__boundaryTexture;
    this.__renderer.render(this.__rttScene, this.__rttCamera, this.__rttCombinedHeight, false);

    //rebind render target to water mesh to ensure vertex shader gets the right texture
    this.__mesh.material.uniforms['uTexture'].value = this.__rttCombinedHeight;
};
SKUNAMI.GpuPipeModelWater.prototype.__swapFluxRenderTargets = function () {
    var temp = this.__rttRenderTargetFlux1;
    this.__rttRenderTargetFlux1 = this.__rttRenderTargetFlux2;
    this.__rttRenderTargetFlux2 = temp;
    // this.__rttQuadMesh.material.uniforms['uTexture'].value = this.__rttRenderTargetFlux2;
};