#
#   Copyright © 2008, Dmitry Titov, Vitaly Puzrin
#   http://wildev.ru, http://rcdesign.ru
#
# ==============================================================================
#

  package RCD::NNTP::Tools::Responses;

    #
    #   Responses codes
    #

    use strict;
    use Exporter qw(import);


    our $VERSION = "0.01"; # $Date: 2008/07/20 12:10:56 $


    our @EXPORT      = qw(response);
    our @EXPORT_OK   = qw(response);


    my %codes = (
      100 => "help text follows",
      199 => "debug output",

      200 => "server ready - posting allowed",
      201 => "server ready - no posting allowed",
      202 => "slave status noted",
      203 => "Streaming is OK",
      205 => "closing connection - goodbye!",
      211 => "n f l s group selected",
     #215 => "list of newsgroups follows",
      215 => "information follows",
      220 => "n <a> article retrieved - head and body follow 221 n <a> article retrieved - head follows",
      222 => "n <a> article retrieved - body follows",
      223 => "n <a> article retrieved - request text separately 230 list of new articles by message-id follows",
      231 => "list of new newsgroups follows",
      235 => "article transferred ok",
      238 => "no such article found, please send it to me",
      239 => "article transferred ok",
      240 => "article posted ok",
      281 => "Authentication accepted",

      335 => "send article to be transferred.  End with <CR-LF>.<CR-LF>",
      340 => "send article to be posted.  End with <CR-LF>.<CR-LF>",
      381 => "More authentication information required",

      400 => "service discontinued",
      411 => "no such news group",
      412 => "no newsgroup has been selected",
      420 => "no current article has been selected",
      421 => "no next article in this group",
      422 => "no previous article in this group",
      423 => "no such article number in this group",
      430 => "no such article found",
      431 => "try sending it again later",
      435 => "article not wanted - do not send it",
      436 => "transfer failed - try again later",
      437 => "article rejected - do not try again.",
      438 => "already have it, please don't send it to me",
      439 => "article transfer failed",
      440 => "posting not allowed",
      441 => "posting failed",
      480 => "Authentication required",
      482 => "Authentication rejected",

      500 => "command not recognized",
      501 => "command syntax error",
      502 => "access restriction or permission denied",
      503 => "program fault - command not performed",
    );


    sub response
    {
      
    }


# end of the RCD::NNTP::Tools::Responses package

1;
