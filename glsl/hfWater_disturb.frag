//Fragment shader for disturbing water simulations
//author: Skeel Lee <skeel@skeelogy.com>

uniform sampler2D uTexture;
uniform sampler2D uStaticObstaclesTexture;
uniform sampler2D uDisturbTexture;
uniform int uUseObstacleTexture;

//disturb is masked by obstacles
uniform int uIsDisturbing;
uniform float uDisturbAmount;
uniform float uDisturbRadius;
uniform vec2 uDisturbPos;

//source is not masked by obstacles
uniform int uIsSourcing;
uniform float uSourceAmount;
uniform float uSourceRadius;
uniform vec2 uSourcePos;

//flood is source for every cell
uniform int uIsFlooding;
uniform float uFloodAmount;

varying vec2 vUv;

void main() {

    //read texture from previous step
    //r channel: height
    vec4 t = texture2D(uTexture, vUv);

    float inObstacle;
    if (uUseObstacleTexture == 1) {
        vec4 tObstacles = texture2D(uStaticObstaclesTexture, vUv);
        inObstacle = tObstacles.r;
    } else {
        //if not using obstacle texture, it means we can just determine this info from the water height.
        //no water means it is in obstacle.
        inObstacle = float(t.r < 0.0);
    }

    //add disturb (will be masked by obstacles)
    if (uIsDisturbing == 1) {
        float len = length(vUv - vec2(uDisturbPos.x, 1.0 - uDisturbPos.y));
        t.r += uDisturbAmount * (1.0 - smoothstep(0.0, uDisturbRadius, len)) * (1.0 - inObstacle);
    }

    //add source (will not be masked by obstacles, otherwise if an area has no water, you can never source into it anymore)
    if (uIsSourcing == 1) {
        float len = length(vUv - vec2(uSourcePos.x, 1.0 - uSourcePos.y));
        t.r += uSourceAmount * (1.0 - smoothstep(0.0, uSourceRadius, len));
    }

    //read disturb texture and just add this amount into the system
    //r channel: disturb amount
    vec4 tDisturb = texture2D(uDisturbTexture, vUv);
    t.r += tDisturb.r;

    //add flood
    if (uIsFlooding == 1) {
        t.r += uFloodAmount;
    }

    //write out to texture for next step
    gl_FragColor = t;
}