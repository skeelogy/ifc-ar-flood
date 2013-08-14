//basic vertex shader that distorts a plane with a sine wave

uniform sampler2D uTexture;
uniform vec2 uTexelSize;
uniform vec2 uTexelWorldSize;
uniform float uHeightMultiplier;

varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUv;

void main() {

    vUv = uv;

    //displace y based on texel value
    vec4 t = texture2D(uTexture, vUv) * uHeightMultiplier;
    vPosition = vec3(position.x, t.r, position.z);

    //find normal
    vec4 tu = texture2D(uTexture, vUv + vec2(uTexelSize.r, 0)) * uHeightMultiplier;
    vec4 tv = texture2D(uTexture, vUv - vec2(0, uTexelSize.g)) * uHeightMultiplier;
    vec3 tangent = normalize(vec3(vPosition.x+uTexelWorldSize.r, tu.r, vPosition.z) - vPosition);
    vec3 bitangent = normalize(vec3(vPosition.x, tv.r, vPosition.z+uTexelWorldSize.g) - vPosition);
    vNormal = normalize(cross(bitangent, tangent));

    gl_Position = projectionMatrix * modelViewMatrix * vec4(vPosition, 1.0);
}