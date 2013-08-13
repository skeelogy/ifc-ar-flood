//a very basic lambert shader with one point light, just for testing

uniform vec3 pointLight1Pos;
uniform vec3 baseColor;

varying vec3 vNormal;  //assume normalized

void main() {
    vec3 color = vec3(dot(vNormal, normalize(pointLight1Pos)));
    gl_FragColor = vec4(baseColor * color, 1.0);
}