{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [ nodejs prisma-engines openssl ];

  shellHook = ''
    export PRISMA_SCHEMA_ENGINE_PATH="${pkgs.prisma-engines}/bin/schema-engine"
    export PRISMA_QUERY_ENGINE_LIBRARY="$PWD/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node"
    export LD_LIBRARY_PATH="${pkgs.openssl.out}/lib:$LD_LIBRARY_PATH"
  '';
}
